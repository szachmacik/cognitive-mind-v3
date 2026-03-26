-- ========================================
-- MISSING SQL FUNCTIONS - CRITICAL
-- These functions are called by Worker but not defined
-- ========================================

-- 1. execute_sql_with_result - CRITICAL (used by Worker for OAuth tokens)
CREATE OR REPLACE FUNCTION execute_sql_with_result(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Execute dynamic query and return result as JSONB
    EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query || ') t'
    INTO result;
    
    RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Query execution failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION execute_sql_with_result IS 'Executes dynamic SQL query and returns results as JSONB. Used by Worker to fetch OAuth tokens and other data.';

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION execute_sql_with_result TO service_role;

-- 2. get_oauth_token - Helper function for cleaner code
CREATE OR REPLACE FUNCTION get_oauth_token(
    p_account_id UUID,
    p_service TEXT  -- 'gmail', 'calendar', 'drive', 'contacts'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vault_name TEXT;
    v_token TEXT;
BEGIN
    -- Construct vault name
    v_vault_name := 'google_oauth_' || p_service || '_' || p_account_id::text;
    
    -- Get token from Vault
    SELECT vault.decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE name = v_vault_name;
    
    RETURN v_token;
END;
$$;

COMMENT ON FUNCTION get_oauth_token IS 'Retrieves Google OAuth token from Vault for specific account and service.';

-- 3. rotate_api_key - Auto-rotation function
CREATE OR REPLACE FUNCTION rotate_api_key(p_key_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_key RECORD;
    v_result JSONB;
BEGIN
    -- Get key details
    SELECT * INTO v_key
    FROM public.api_keys_managed
    WHERE id = p_key_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'API key not found or inactive'
        );
    END IF;
    
    -- Update rotation timestamp
    UPDATE public.api_keys_managed
    SET 
        last_rotated = NOW(),
        next_rotation = NOW() + INTERVAL '90 days'
    WHERE id = p_key_id;
    
    -- Log rotation
    INSERT INTO public.api_keys_audit_log (
        api_key_id,
        action,
        metadata
    ) VALUES (
        p_key_id,
        'rotated',
        jsonb_build_object(
            'old_rotation', v_key.last_rotated,
            'new_rotation', NOW()
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'key_id', p_key_id,
        'next_rotation', NOW() + INTERVAL '90 days'
    );
END;
$$;

COMMENT ON FUNCTION rotate_api_key IS 'Rotates API key and updates rotation schedule.';

-- 4. log_protection_action - Centralized logging
CREATE OR REPLACE FUNCTION log_protection_action(
    p_account_id UUID,
    p_service TEXT,
    p_action TEXT,
    p_details JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.manychat_cleaner_logs (
        log_level,
        message,
        context
    ) VALUES (
        'info',
        'Protection action: ' || p_service || ' - ' || p_action,
        jsonb_build_object(
            'account_id', p_account_id,
            'service', p_service,
            'action', p_action,
            'details', p_details,
            'timestamp', NOW()
        )
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_protection_action IS 'Centralized logging for all protection actions (Gmail, Calendar, Drive, Contacts).';

-- 5. get_active_patterns - Get learned patterns for analysis
CREATE OR REPLACE FUNCTION get_active_patterns()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_patterns JSONB;
BEGIN
    SELECT json_agg(
        json_build_object(
            'id', id,
            'pattern_type', pattern_type,
            'pattern_signature', pattern_signature,
            'confidence', confidence,
            'detection_count', detection_count,
            'accuracy', accuracy
        )
    ) INTO v_patterns
    FROM public.bot_patterns_learned
    WHERE is_active = true
    ORDER BY accuracy DESC, detection_count DESC
    LIMIT 100;
    
    RETURN COALESCE(v_patterns, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION get_active_patterns IS 'Returns active learned patterns for bot detection.';

-- 6. record_detection - Unified detection recording
CREATE OR REPLACE FUNCTION record_detection(
    p_identifier_type TEXT,
    p_identifier_value TEXT,
    p_platform TEXT,
    p_confidence NUMERIC,
    p_bot_indicators JSONB,
    p_soul_signature JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_detection_id UUID;
    v_is_banned BOOLEAN := false;
BEGIN
    -- Record cross-platform detection
    v_detection_id := record_cross_platform_detection(
        p_identifier_type,
        p_identifier_value,
        p_platform,
        p_confidence,
        p_soul_signature
    );
    
    -- If high confidence (>=80%), also add to global blacklist
    IF p_confidence >= 80 THEN
        -- Add to global blacklist
        PERFORM add_to_global_blacklist(
            p_email := CASE WHEN p_identifier_type = 'email' THEN p_identifier_value ELSE NULL END,
            p_phone := CASE WHEN p_identifier_type = 'phone' THEN p_identifier_value ELSE NULL END,
            p_profile_pic_hash := CASE WHEN p_identifier_type = 'profile_pic_hash' THEN p_identifier_value ELSE NULL END,
            p_detection_source := p_platform,
            p_confidence := p_confidence,
            p_bot_indicators := p_bot_indicators
        );
        
        v_is_banned := true;
    END IF;
    
    -- Log detection
    INSERT INTO public.manychat_cleaner_logs (
        log_level,
        message,
        context
    ) VALUES (
        'info',
        'Bot detected: ' || p_identifier_value || ' (' || p_confidence || '% confidence)',
        jsonb_build_object(
            'detection_id', v_detection_id,
            'identifier_type', p_identifier_type,
            'identifier_value', p_identifier_value,
            'platform', p_platform,
            'confidence', p_confidence,
            'banned', v_is_banned,
            'soul_signature', p_soul_signature
        )
    );
    
    RETURN v_detection_id;
END;
$$;

COMMENT ON FUNCTION record_detection IS 'Unified function to record bot detection across all platforms.';

-- 7. get_flow_queue - Get flows pending review
CREATE OR REPLACE FUNCTION get_flow_queue()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_flows JSONB;
BEGIN
    SELECT json_agg(
        json_build_object(
            'id', id,
            'flow_name', flow_name,
            'confidence', confidence,
            'patterns_source', patterns_source,
            'created_at', created_at
        ) ORDER BY confidence DESC, created_at DESC
    ) INTO v_flows
    FROM public.manychat_auto_flows
    WHERE status = 'pending_review'
    LIMIT 50;
    
    RETURN COALESCE(v_flows, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION get_flow_queue IS 'Returns flows pending review for approval/deployment.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_oauth_token TO service_role;
GRANT EXECUTE ON FUNCTION rotate_api_key TO service_role;
GRANT EXECUTE ON FUNCTION log_protection_action TO service_role;
GRANT EXECUTE ON FUNCTION get_active_patterns TO service_role;
GRANT EXECUTE ON FUNCTION record_detection TO service_role;
GRANT EXECUTE ON FUNCTION get_flow_queue TO service_role;
