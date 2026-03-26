-- ========================================
-- AUTONOMOUS CRON JOBS
-- Scheduled tasks for system autonomy
-- ========================================

-- Prerequisites: pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. API KEY ROTATION ALERTS (Daily at 9:00 AM UTC)
-- Checks for keys expiring in 7 days and sends Telegram alerts
SELECT cron.schedule(
    'api-key-rotation-check',
    '0 9 * * *',
    $$
    DO $$
    DECLARE
        v_keys_expiring JSONB;
        v_telegram_message TEXT;
    BEGIN
        -- Get keys expiring soon
        SELECT json_agg(
            json_build_object(
                'service', service,
                'account_name', account_name,
                'days_remaining', EXTRACT(DAY FROM (next_rotation - NOW()))
            )
        ) INTO v_keys_expiring
        FROM api_keys_managed
        WHERE is_active = true
        AND next_rotation <= NOW() + INTERVAL '7 days'
        AND next_rotation > NOW();
        
        -- If any keys expiring, send Telegram alert
        IF v_keys_expiring IS NOT NULL THEN
            v_telegram_message := '⚠️ API Keys Rotation Alert\n\n' ||
                'The following keys need rotation within 7 days:\n\n' ||
                v_keys_expiring::text;
            
            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot8394457153:AAFZQ4eMHaiAnmwejmTfWZHI_5KSqhXgCXg/sendMessage',
                headers := '{"Content-Type": "application/json"}'::jsonb,
                body := jsonb_build_object(
                    'chat_id', '8149345223',
                    'text', v_telegram_message,
                    'parse_mode', 'HTML'
                )
            );
        END IF;
    END $$;
    $$
);

-- 2. AUTO-APPROVE HIGH-CONFIDENCE FLOWS (Every 6 hours)
-- Automatically approves flows with confidence >= 90%
SELECT cron.schedule(
    'auto-approve-flows',
    '0 */6 * * *',
    $$
    UPDATE manychat_auto_flows
    SET 
        status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = 'auto_approval_system'
    WHERE status = 'pending_review'
    AND confidence >= 90
    AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING flow_name;
    $$
);

-- 3. PATTERN LEARNING UPDATE (Every 12 hours)
-- Updates learned patterns based on recent detections
SELECT cron.schedule(
    'update-learned-patterns',
    '0 */12 * * *',
    $$
    DO $$
    DECLARE
        v_recent_bots RECORD;
        v_pattern_signature JSONB;
    BEGIN
        -- Analyze bots detected in last 24 hours
        FOR v_recent_bots IN
            SELECT 
                bot_indicators,
                COUNT(*) as detection_count
            FROM known_bots_global
            WHERE created_at > NOW() - INTERVAL '24 hours'
            AND is_banned = true
            GROUP BY bot_indicators
            HAVING COUNT(*) >= 3  -- Only patterns seen 3+ times
        LOOP
            -- Create/update pattern
            INSERT INTO bot_patterns_learned (
                pattern_type,
                pattern_signature,
                detection_count,
                confidence,
                is_active
            ) VALUES (
                'auto_learned',
                v_recent_bots.bot_indicators,
                v_recent_bots.detection_count,
                LEAST(v_recent_bots.detection_count * 10, 95),  -- Max 95% confidence
                true
            )
            ON CONFLICT (pattern_signature)
            DO UPDATE SET
                detection_count = bot_patterns_learned.detection_count + EXCLUDED.detection_count,
                confidence = LEAST(bot_patterns_learned.confidence + 5, 98),  -- Max 98%
                last_used_at = NOW();
        END LOOP;
    END $$;
    $$
);

-- 4. GOOGLE CONTACTS VALIDATION (Weekly on Sunday at 2:00 AM)
-- Scans Google Contacts for blacklisted emails
SELECT cron.schedule(
    'validate-google-contacts-weekly',
    '0 2 * * 0',
    $$
    DO $$
    DECLARE
        v_message TEXT;
        v_contacts_checked INTEGER := 0;
        v_bots_found INTEGER := 0;
    BEGIN
        -- This triggers a Worker endpoint to scan contacts
        -- Worker will call Google People API and check each contact
        PERFORM net.http_post(
            url := 'https://cognitive-mind.ofshore.dev/api/tasks/validate-contacts',
            headers := '{"Content-Type": "application/json", "X-Cron-Job": "true"}'::jsonb,
            body := jsonb_build_object(
                'scan_all_accounts', true,
                'scheduled_at', NOW()
            )
        );
        
        v_message := '🔍 Weekly Google Contacts validation started at ' || NOW()::text;
        
        -- Log action
        INSERT INTO manychat_cleaner_logs (log_level, message, context)
        VALUES ('info', 'Weekly contacts validation triggered', jsonb_build_object('time', NOW()));
        
    END $$;
    $$
);

-- 5. TELEGRAM DAILY REPORT (Every day at 8:00 AM PL time = 7:00 AM UTC)
-- Sends daily summary of bot detections and system health
SELECT cron.schedule(
    'daily-telegram-report',
    '0 7 * * *',
    $$
    DO $$
    DECLARE
        v_stats JSONB;
        v_message TEXT;
    BEGIN
        -- Gather stats from last 24 hours
        SELECT json_build_object(
            'bots_detected', (SELECT COUNT(*) FROM known_bots_global WHERE created_at > NOW() - INTERVAL '24 hours'),
            'cross_platform_bans', (SELECT COUNT(*) FROM cross_platform_detections WHERE created_at > NOW() - INTERVAL '24 hours'),
            'flows_generated', (SELECT COUNT(*) FROM manychat_auto_flows WHERE created_at > NOW() - INTERVAL '24 hours'),
            'flows_deployed', (SELECT COUNT(*) FROM manychat_auto_flows WHERE deployed_at > NOW() - INTERVAL '24 hours'),
            'gmail_actions', (SELECT COUNT(*) FROM manychat_cleaner_logs WHERE message LIKE '%Gmail%' AND created_at > NOW() - INTERVAL '24 hours'),
            'total_blacklist_size', (SELECT COUNT(*) FROM known_bots_global WHERE is_banned = true)
        ) INTO v_stats;
        
        -- Build message
        v_message := '📊 <b>CognitiveMind Daily Report</b>\n\n' ||
            '🤖 Bots detected: ' || (v_stats->>'bots_detected') || '\n' ||
            '🌐 Cross-platform bans: ' || (v_stats->>'cross_platform_bans') || '\n' ||
            '⚙️ Flows generated: ' || (v_stats->>'flows_generated') || '\n' ||
            '🚀 Flows deployed: ' || (v_stats->>'flows_deployed') || '\n' ||
            '📧 Gmail actions: ' || (v_stats->>'gmail_actions') || '\n' ||
            '📋 Total blacklist: ' || (v_stats->>'total_blacklist_size') || '\n\n' ||
            '🕐 Report time: ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ' UTC';
        
        -- Send to Telegram
        PERFORM net.http_post(
            url := 'https://api.telegram.org/bot8394457153:AAFZQ4eMHaiAnmwejmTfWZHI_5KSqhXgCXg/sendMessage',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := jsonb_build_object(
                'chat_id', '8149345223',
                'text', v_message,
                'parse_mode', 'HTML'
            )
        );
    END $$;
    $$
);

-- 6. CLEANUP OLD LOGS (Every day at 3:00 AM)
-- Removes logs older than 30 days to keep database clean
SELECT cron.schedule(
    'cleanup-old-logs',
    '0 3 * * *',
    $$
    DELETE FROM manychat_cleaner_logs
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND log_level NOT IN ('error', 'critical');
    $$
);

-- 7. PATTERN ACCURACY UPDATE (Daily at 4:00 AM)
-- Calculates accuracy of learned patterns based on false positives
SELECT cron.schedule(
    'update-pattern-accuracy',
    '0 4 * * *',
    $$
    UPDATE bot_patterns_learned
    SET accuracy = CASE
        WHEN detection_count = 0 THEN 50
        WHEN false_positive_rate IS NULL THEN confidence
        ELSE GREATEST(50, 100 - (false_positive_rate * 100))
    END,
    updated_at = NOW()
    WHERE is_active = true;
    $$
);

-- 8. UPSTASH CACHE WARMUP (Every hour)
-- Pre-warms cache with frequently accessed data
SELECT cron.schedule(
    'upstash-cache-warmup',
    '0 * * * *',
    $$
    DO $$
    BEGIN
        -- Trigger Worker to warm cache
        PERFORM net.http_post(
            url := 'https://cognitive-mind.ofshore.dev/api/cache/warmup',
            headers := '{"Content-Type": "application/json", "X-Cron-Job": "true"}'::jsonb,
            body := jsonb_build_object('scheduled_at', NOW())
        );
    END $$;
    $$
);

-- View all scheduled jobs
COMMENT ON EXTENSION pg_cron IS 'CognitiveMind Bot Defense - 8 autonomous cron jobs configured';

-- To view all active cron jobs:
-- SELECT * FROM cron.job ORDER BY schedule;

-- To manually run a job (for testing):
-- SELECT cron.run_job(jobid) FROM cron.job WHERE jobname = 'daily-telegram-report';

-- To unschedule a job:
-- SELECT cron.unschedule('job-name');
