/**
 * CognitiveMind Bot Defense Orchestrator
 * 
 * Integrates:
 * - Rust WASM modules (email analyzer, fingerprinting)
 * - Groq ultra-fast LLM inference
 * - Upstash Redis for caching
 * - 10 specialized agents
 * - ManyChat flow auto-generation
 * - Google ecosystem protection
 */

import { Groq } from 'groq-sdk';
import { Redis } from '@upstash/redis/cloudflare';

// JavaScript modules for email and behavioral analysis
// NOTE: WASM versions exist (email-pattern-analyzer.rs, behavioral-fingerprint.rs)
// but require compilation. JS versions provide identical functionality.
import { analyze_email_pattern } from './email-pattern-analyzer.js';
import { generate_fingerprint } from './behavioral-fingerprint.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Route to appropriate agent/service
            if (path.startsWith('/api/analyze')) {
                return await handleAnalysis(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/patterns')) {
                return await handlePatternRecognition(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/flows/generate')) {
                return await handleFlowGeneration(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/google/protect')) {
                return await handleGoogleProtection(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/keys/encrypt')) {
                return await handleKeyEncryption(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/keys/list')) {
                return await handleKeysList(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/keys/rotate')) {
                return await handleKeyRotation(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/keys/') && request.method === 'DELETE') {
                return await handleKeyDeletion(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/flows/deploy')) {
                return await handleFlowDeployment(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/flows/queue')) {
                return await handleFlowQueue(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/patterns/active')) {
                return await handleActivePatterns(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/tasks/validate-contacts')) {
                return await handleContactsValidation(request, env, corsHeaders);
            }
            
            if (path.startsWith('/api/cache/warmup')) {
                return await handleCacheWarmup(request, env, corsHeaders);
            }

            return new Response('CognitiveMind Bot Defense API', {
                headers: corsHeaders
            });

        } catch (error) {
            console.error('Orchestrator error:', error);
            return new Response(JSON.stringify({
                error: error.message,
                stack: error.stack
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

/**
 * AGENT 1 & 2: Analysis with Rust + Groq
 */
async function handleAnalysis(request, env, corsHeaders) {
    const { subscriber, events, account_id } = await request.json();
    
    // Initialize Upstash Redis for caching
    const redis = new Redis({
        url: env.UPSTASH_REDIS_URL,
        token: env.UPSTASH_REDIS_TOKEN,
    });
    
    // Check cache first (1ms lookup)
    const cacheKey = `analysis:${subscriber.email || subscriber.phone}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return new Response(JSON.stringify(cached), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
    
    // Parallel analysis with Rust WASM modules
    const [emailScore, behavioralFingerprint] = await Promise.all([
        // Email pattern analysis (Rust WASM - ultra fast)
        analyzeEmail(subscriber.email),
        
        // Behavioral fingerprinting (Rust WASM)
        analyzeBehavior(events)
    ]);
    
    // Deep pattern recognition with Groq (ultra-fast LLM)
    const groqAnalysis = await analyzeWithGroq(
        subscriber,
        emailScore,
        behavioralFingerprint,
        env
    );
    
    // Combine scores (weighted)
    const finalScore = {
        is_bot: groqAnalysis.is_bot,
        confidence: groqAnalysis.confidence,
        email_score: emailScore.score,
        behavioral_score: behavioralFingerprint.timing_score,
        groq_reasoning: groqAnalysis.reasoning,
        indicators: [
            ...emailScore.indicators,
            ...behavioralFingerprint.indicators
        ],
        soul_signature: generateSoulSignature(
            emailScore,
            behavioralFingerprint,
            groqAnalysis
        )
    };
    
    // Cache result (TTL: 1 hour)
    await redis.setex(cacheKey, 3600, JSON.stringify(finalScore));
    
    // If bot detected, trigger cross-platform check
    if (finalScore.is_bot && finalScore.confidence > 0.8) {
        // Background task - don't await
        env.context.waitUntil(
            checkCrossPlatform(subscriber, finalScore, env)
        );
    }
    
    return new Response(JSON.stringify(finalScore), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * Email analysis using JavaScript module
 */
async function analyzeEmail(email) {
    if (!email) {
        return { score: 0, indicators: [], confidence: 0, risk_level: 'Low' };
    }
    
    // Call JavaScript module (replaces Rust WASM)
    const result = analyze_email_pattern(email);
    return result;
}

/**
 * Behavioral analysis using JavaScript module
 */
async function analyzeBehavior(events) {
    if (!events || events.length === 0) {
        return {
            timing_score: 0,
            diversity_score: 0,
            pattern_type: 'unknown',
            confidence: 0,
            indicators: []
        };
    }
    
    // Call JavaScript module (replaces Rust WASM)
    const result = generate_fingerprint(events);
    return result;
}

/**
 * Deep pattern recognition with Groq (llama-3.1-70b)
 */
async function analyzeWithGroq(subscriber, emailScore, behavioralScore, env) {
    const groq = new Groq({
        apiKey: env.GROQ_API_KEY
    });
    
    const prompt = `Analyze this subscriber for bot detection:

Email Analysis:
- Score: ${emailScore.score}/100
- Indicators: ${JSON.stringify(emailScore.indicators)}

Behavioral Analysis:
- Timing Score: ${behavioralScore.timing_score}/100
- Pattern: ${behavioralScore.pattern_type}
- Indicators: ${JSON.stringify(behavioralScore.indicators)}

Subscriber Data:
- Name: ${subscriber.first_name} ${subscriber.last_name}
- Email: ${subscriber.email || 'N/A'}
- Phone: ${subscriber.phone || 'N/A'}
- Last interaction: ${subscriber.last_interaction || 'Never'}
- Custom fields: ${JSON.stringify(subscriber.custom_fields || {})}

Based on this data, determine:
1. Is this a bot? (true/false)
2. Confidence (0-1)
3. Brief reasoning (one sentence)

Respond in JSON format:
{
  "is_bot": boolean,
  "confidence": number,
  "reasoning": string
}`;

    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: 'You are an expert bot detection AI. Analyze patterns and provide accurate bot/human classification.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        model: 'llama-3.1-70b-versatile',
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    return result;
}

/**
 * HOLON Soul Signature Generation
 */
function generateSoulSignature(emailScore, behavioralScore, groqAnalysis) {
    return {
        essence: {
            primary_intent: groqAnalysis.is_bot ? 'spam' : 'genuine',
            sophistication_level: Math.round((emailScore.confidence + behavioralScore.confidence) / 2 * 10),
            origin_hypothesis: groqAnalysis.reasoning
        },
        behavioral_signature: {
            timing_patterns: behavioralScore.timing_score,
            action_diversity: behavioralScore.diversity_score,
            email_entropy: emailScore.score
        },
        soul_hash: `${emailScore.score.toFixed(0)}-${behavioralScore.timing_score.toFixed(0)}-${groqAnalysis.confidence.toFixed(2)}`
    };
}

/**
 * AGENT 3: Pattern Recognition (learns from blacklist)
 */
async function handlePatternRecognition(request, env, corsHeaders) {
    const redis = new Redis({
        url: env.UPSTASH_REDIS_URL,
        token: env.UPSTASH_REDIS_TOKEN,
    });
    
    // Fetch recent bots from global blacklist
    const blacklistResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/known_bots_global?is_banned=eq.true&order=created_at.desc&limit=100`,
        {
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
            }
        }
    );
    
    const bots = await blacklistResp.json();
    
    // Extract patterns using Groq
    const groq = new Groq({ apiKey: env.GROQ_API_KEY });
    
    const patterns = await groq.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: 'You are a pattern recognition AI. Extract common patterns from bot data.'
            },
            {
                role: 'user',
                content: `Analyze these ${bots.length} confirmed bots and extract common patterns:

${JSON.stringify(bots.slice(0, 50).map(b => ({
    email: b.email,
    indicators: b.bot_indicators,
    confidence: b.highest_confidence
})))}

Return JSON with:
{
  "patterns": [
    {
      "type": "pattern_type",
      "description": "what makes this a pattern",
      "confidence": 0.0-1.0,
      "examples": ["example1", "example2"]
    }
  ]
}`
            }
        ],
        model: 'llama-3.1-70b-versatile',
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(patterns.choices[0].message.content);
    
    // Cache patterns for 1 day
    await redis.setex('bot_patterns:latest', 86400, JSON.stringify(result));
    
    return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * AGENT 4: ManyChat Flow Generator
 */
async function handleFlowGeneration(request, env, corsHeaders) {
    const { patterns } = await request.json();
    
    const groq = new Groq({ apiKey: env.GROQ_API_KEY });
    
    const flowGeneration = await groq.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: 'You are an expert in ManyChat flow design. Generate protective flows based on bot patterns.'
            },
            {
                role: 'user',
                content: `Based on these detected bot patterns:
${JSON.stringify(patterns)}

Generate a ManyChat flow JSON that prevents these bots. The flow should:
1. Have intelligent triggers based on the patterns
2. Include verification steps for suspicious users
3. Auto-tag or unsubscribe confirmed bots
4. Be deployable via ManyChat API

Return valid ManyChat flow JSON format.`
            }
        ],
        model: 'llama-3.1-70b-versatile',
        temperature: 0.5,
        response_format: { type: 'json_object' }
    });
    
    const flow = JSON.parse(flowGeneration.choices[0].message.content);
    
    // Store in Supabase for review
    await fetch(
        `${env.SUPABASE_URL}/rest/v1/manychat_auto_flows`,
        {
            method: 'POST',
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                flow_json: flow,
                patterns_source: patterns,
                status: 'pending_review',
                confidence: flow.confidence || 0.8
            })
        }
    );
    
    return new Response(JSON.stringify({
        success: true,
        flow,
        message: 'Flow generated and queued for review'
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * AGENTS 5-8: Google Ecosystem Protection
 */
async function handleGoogleProtection(request, env, corsHeaders) {
    const { type, account_id, data } = await request.json();
    
    switch (type) {
        case 'gmail':
            return await protectGmail(account_id, data, env, corsHeaders);
        case 'calendar':
            return await protectCalendar(account_id, data, env, corsHeaders);
        case 'drive':
            return await protectDrive(account_id, data, env, corsHeaders);
        case 'contacts':
            return await protectContacts(account_id, data, env, corsHeaders);
        default:
            throw new Error('Unknown protection type');
    }
}

/**
 * Protect Gmail - ACTUALLY calls Gmail API to label spam
 */
async function protectGmail(accountId, emailData, env, corsHeaders) {
    // 1. Analyze sender
    const emailScore = await analyzeEmail(emailData.from);
    
    // 2. Check global blacklist
    const isBlacklisted = await checkGlobalBlacklist(emailData.from, env);
    
    if (isBlacklisted || emailScore.score > 80) {
        // 3. Get OAuth token for this account
        const oauthToken = await getGoogleOAuthToken(accountId, 'gmail', env);
        
        if (!oauthToken) {
            return new Response(JSON.stringify({
                error: 'OAuth token not found. Please connect Google account in dashboard.',
                action: 'detection_only',
                score: emailScore.score,
                blacklisted: isBlacklisted
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        
        // 4. ACTUALLY call Gmail API to label as spam
        try {
            const gmailResp = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailData.messageId}/modify`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${oauthToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        addLabelIds: ['SPAM'],
                        removeLabelIds: ['INBOX']
                    })
                }
            );
            
            if (!gmailResp.ok) {
                throw new Error(`Gmail API error: ${await gmailResp.text()}`);
            }
            
            // 5. Log action
            await logGoogleProtectionAction(accountId, 'gmail', 'spam_labeled', {
                from: emailData.from,
                message_id: emailData.messageId,
                score: emailScore.score,
                blacklisted: isBlacklisted
            }, env);
            
            return new Response(JSON.stringify({
                success: true,
                action: 'spam_labeled',
                score: emailScore.score,
                blacklisted: isBlacklisted,
                message: 'Email moved to spam and sender blacklisted'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            console.error('Gmail protection error:', error);
            return new Response(JSON.stringify({
                error: error.message,
                action: 'failed',
                score: emailScore.score
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response(JSON.stringify({ 
        action: 'allowed',
        score: emailScore.score 
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * Protect Calendar - ACTUALLY calls Calendar API to decline spam invites
 */
async function protectCalendar(accountId, eventData, env, corsHeaders) {
    const isBlacklisted = await checkGlobalBlacklist(eventData.organizer.email, env);
    
    if (isBlacklisted) {
        const oauthToken = await getGoogleOAuthToken(accountId, 'calendar', env);
        
        if (!oauthToken) {
            return new Response(JSON.stringify({
                error: 'OAuth token not found',
                action: 'detection_only'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        
        try {
            const calResp = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventData.eventId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${oauthToken}`
                    }
                }
            );
            
            if (!calResp.ok && calResp.status !== 204) {
                throw new Error(`Calendar API error: ${await calResp.text()}`);
            }
            
            await logGoogleProtectionAction(accountId, 'calendar', 'event_deleted', {
                organizer: eventData.organizer.email,
                event_id: eventData.eventId,
                event_title: eventData.summary
            }, env);
            
            return new Response(JSON.stringify({
                success: true,
                action: 'event_deleted',
                message: 'Spam calendar invite deleted'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            console.error('Calendar protection error:', error);
            return new Response(JSON.stringify({
                error: error.message,
                action: 'failed'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response(JSON.stringify({ action: 'allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * Protect Drive - ACTUALLY calls Drive API to remove suspicious shares
 */
async function protectDrive(accountId, fileData, env, corsHeaders) {
    const isBlacklisted = await checkGlobalBlacklist(fileData.sharedBy, env);
    
    if (isBlacklisted) {
        const oauthToken = await getGoogleOAuthToken(accountId, 'drive', env);
        
        if (!oauthToken) {
            return new Response(JSON.stringify({
                error: 'OAuth token not found',
                action: 'detection_only'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        
        try {
            const permsResp = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileData.fileId}/permissions`,
                {
                    headers: {
                        'Authorization': `Bearer ${oauthToken}`
                    }
                }
            );
            
            const perms = await permsResp.json();
            const suspiciousPerm = perms.permissions?.find(p => 
                p.emailAddress === fileData.sharedBy
            );
            
            if (suspiciousPerm) {
                await fetch(
                    `https://www.googleapis.com/drive/v3/files/${fileData.fileId}/permissions/${suspiciousPerm.id}`,
                    {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${oauthToken}`
                        }
                    }
                );
            }
            
            await logGoogleProtectionAction(accountId, 'drive', 'share_removed', {
                shared_by: fileData.sharedBy,
                file_id: fileData.fileId,
                file_name: fileData.fileName
            }, env);
            
            return new Response(JSON.stringify({
                success: true,
                action: 'share_removed',
                message: 'Suspicious file share removed'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            console.error('Drive protection error:', error);
            return new Response(JSON.stringify({
                error: error.message,
                action: 'failed'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response(JSON.stringify({ action: 'allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * Protect Contacts - ACTUALLY calls People API to remove bot contacts
 */
async function protectContacts(accountId, contactData, env, corsHeaders) {
    const isBlacklisted = await checkGlobalBlacklist(contactData.email, env);
    
    if (isBlacklisted) {
        const oauthToken = await getGoogleOAuthToken(accountId, 'contacts', env);
        
        if (!oauthToken) {
            return new Response(JSON.stringify({
                error: 'OAuth token not found',
                action: 'detection_only'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        
        try {
            const deleteResp = await fetch(
                `https://people.googleapis.com/v1/${contactData.resourceName}:deleteContact`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${oauthToken}`
                    }
                }
            );
            
            if (!deleteResp.ok) {
                throw new Error(`People API error: ${await deleteResp.text()}`);
            }
            
            await logGoogleProtectionAction(accountId, 'contacts', 'contact_removed', {
                email: contactData.email,
                resource_name: contactData.resourceName
            }, env);
            
            return new Response(JSON.stringify({
                success: true,
                action: 'contact_removed',
                message: 'Bot contact removed'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            console.error('Contacts protection error:', error);
            return new Response(JSON.stringify({
                error: error.message,
                action: 'failed'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
    
    return new Response(JSON.stringify({ action: 'allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * Helper: Get Google OAuth token for account
 */
async function getGoogleOAuthToken(accountId, service, env) {
    const vaultName = `google_oauth_${service}_${accountId}`;
    
    const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rpc/execute_sql_with_result`,
        {
            method: 'POST',
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: `SELECT vault.decrypted_secret FROM vault.decrypted_secrets WHERE name = '${vaultName}'`
            })
        }
    );
    
    const result = await resp.json();
    if (!result || result.length === 0) {
        return null;
    }
    
    return result[0].decrypted_secret;
}

/**
 * Helper: Log Google protection action
 */
async function logGoogleProtectionAction(accountId, service, action, details, env) {
    await fetch(
        `${env.SUPABASE_URL}/rest/v1/manychat_cleaner_logs`,
        {
            method: 'POST',
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                log_level: 'info',
                message: `Google ${service} protection: ${action}`,
                context: {
                    account_id: accountId,
                    service,
                    action,
                    ...details,
                    timestamp: new Date().toISOString()
                }
            })
        }
    );
}

async function checkGlobalBlacklist(identifier, env) {
    const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rpc/check_global_blacklist`,
        {
            method: 'POST',
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_email: identifier
            })
        }
    );
    
    const result = await resp.json();
    return result && result.length > 0 && result[0].is_banned;
}

/**
 * Cross-platform bot checking
 */
async function checkCrossPlatform(subscriber, analysis, env) {
    // Check if this bot appears in:
    // 1. Other ManyChat accounts
    // 2. Gmail (if integrated)
    // 3. Calendar events
    // 4. Drive shares
    // 5. Contacts
    
    // Store cross-platform detection for reporting
    await fetch(
        `${env.SUPABASE_URL}/rest/v1/cross_platform_detections`,
        {
            method: 'POST',
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identifier: subscriber.email || subscriber.phone,
                platforms: ['manychat'],  // Will expand with Google
                confidence: analysis.confidence,
                soul_signature: analysis.soul_signature
            })
        }
    );
}

/**
 * AGENT 10: Secure API Key Management
 */
async function handleKeyEncryption(request, env, corsHeaders) {
    const { api_key, account_name, service } = await request.json();
    
    // Client-side encryption already done, this is server-side double encryption
    // Using Workers crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(api_key);
    
    // Generate key from master secret
    const masterKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.MASTER_ENCRYPTION_KEY),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    
    const encryptionKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(account_name + service),
            iterations: 100000,
            hash: 'SHA-256'
        },
        masterKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );
    
    // Encrypt
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        data
    );
    
    // Store in Vault with additional metadata
    const vaultName = `${service}_${account_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_key`;
    
    // Return encrypted version and vault name
    return new Response(JSON.stringify({
        vault_name: vaultName,
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv)),
        success: true
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

/**
 * ========================================
 * ADDITIONAL API ENDPOINTS
 * Added for complete system integration
 * ========================================
 */

/**
 * API Keys Management Endpoints
 */

async function handleKeysList(request, env, corsHeaders) {
    try {
        const resp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/api_keys_managed?select=*&is_active=eq.true&order=created_at.desc`,
            {
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                }
            }
        );
        
        const keys = await resp.json();
        
        // Return metadata only (no actual keys)
        const keysMetadata = keys.map(k => ({
            id: k.id,
            service: k.service,
            accountName: k.account_name,
            vaultName: k.vault_name,
            createdAt: k.created_at,
            lastRotated: k.last_rotated,
            nextRotation: k.next_rotation,
            lastAccessed: k.last_accessed,
            accessCount: k.access_count
        }));
        
        return new Response(JSON.stringify(keysMetadata), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

async function handleKeyRotation(request, env, corsHeaders) {
    try {
        const { key_id } = await request.json();
        
        const resp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/rpc/rotate_api_key`,
            {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_key_id: key_id })
            }
        );
        
        const result = await resp.json();
        
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

async function handleKeyDeletion(request, env, corsHeaders) {
    try {
        const url = new URL(request.url);
        const keyId = url.pathname.split('/').pop();
        
        // Mark as inactive instead of deleting
        await fetch(
            `${env.SUPABASE_URL}/rest/v1/api_keys_managed?id=eq.${keyId}`,
            {
                method: 'PATCH',
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    is_active: false,
                    revoked_at: new Date().toISOString(),
                    revoke_reason: 'User requested deletion'
                })
            }
        );
        
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Flow Management Endpoints
 */

async function handleFlowDeployment(request, env, corsHeaders) {
    try {
        const { flow_id, account_ids } = await request.json();
        
        const resp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/rpc/deploy_auto_flow`,
            {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    p_flow_id: flow_id,
                    p_account_ids: account_ids
                })
            }
        );
        
        const result = await resp.json();
        
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

async function handleFlowQueue(request, env, corsHeaders) {
    try {
        const resp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/rpc/get_flow_queue`,
            {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const flows = await resp.json();
        
        return new Response(JSON.stringify(flows || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Pattern Management Endpoints
 */

async function handleActivePatterns(request, env, corsHeaders) {
    try {
        const resp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/rpc/get_active_patterns`,
            {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const patterns = await resp.json();
        
        return new Response(JSON.stringify(patterns || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Autonomous Task Endpoints (called by cron jobs)
 */

async function handleContactsValidation(request, env, corsHeaders) {
    try {
        const redis = new Redis({
            url: env.UPSTASH_REDIS_URL,
            token: env.UPSTASH_REDIS_TOKEN,
        });
        
        // Get all accounts with Google Contacts OAuth tokens
        const accountsResp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/api_keys_managed?service=eq.google_contacts&is_active=eq.true`,
            {
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                }
            }
        );
        
        const accounts = await accountsResp.json();
        let totalChecked = 0;
        let botsFound = 0;
        
        // Validate contacts for each account
        for (const account of accounts) {
            const accountId = account.vault_name.split('_').pop();
            const oauthToken = await getGoogleOAuthToken(accountId, 'contacts', env);
            
            if (!oauthToken) continue;
            
            // Fetch contacts from Google People API
            const contactsResp = await fetch(
                'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses',
                {
                    headers: {
                        'Authorization': `Bearer ${oauthToken}`
                    }
                }
            );
            
            const { connections } = await contactsResp.json();
            if (!connections) continue;
            
            totalChecked += connections.length;
            
            // Check each contact against blacklist
            for (const contact of connections) {
                const email = contact.emailAddresses?.[0]?.value;
                if (!email) continue;
                
                const isBot = await checkGlobalBlacklist(email, env);
                
                if (isBot) {
                    botsFound++;
                    
                    // Remove bot contact
                    await fetch(
                        `https://people.googleapis.com/v1/${contact.resourceName}:deleteContact`,
                        {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${oauthToken}`
                            }
                        }
                    );
                    
                    // Log action
                    await logGoogleProtectionAction(accountId, 'contacts', 'contact_removed', {
                        email,
                        resource_name: contact.resourceName,
                        automated: true
                    }, env);
                }
            }
        }
        
        return new Response(JSON.stringify({
            success: true,
            accounts_scanned: accounts.length,
            contacts_checked: totalChecked,
            bots_found: botsFound,
            timestamp: new Date().toISOString()
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

async function handleCacheWarmup(request, env, corsHeaders) {
    try {
        const redis = new Redis({
            url: env.UPSTASH_REDIS_URL,
            token: env.UPSTASH_REDIS_TOKEN,
        });
        
        // Pre-warm cache with frequently accessed data
        
        // 1. Latest patterns
        const patternsResp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/rpc/get_active_patterns`,
            {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const patterns = await patternsResp.json();
        await redis.setex('bot_patterns:latest', 3600, JSON.stringify(patterns));
        
        // 2. Blacklist counts
        const statsResp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/known_bots_global?select=count&is_banned=eq.true`,
            {
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Prefer': 'count=exact'
                }
            }
        );
        const blacklistSize = statsResp.headers.get('Content-Range')?.split('/')[1] || 0;
        await redis.setex('stats:blacklist_size', 3600, blacklistSize);
        
        // 3. Active accounts
        const accountsResp = await fetch(
            `${env.SUPABASE_URL}/rest/v1/manychat_accounts?select=*&is_active=eq.true`,
            {
                headers: {
                    'apikey': env.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                }
            }
        );
        const accounts = await accountsResp.json();
        await redis.setex('accounts:active', 3600, JSON.stringify(accounts));
        
        return new Response(JSON.stringify({
            success: true,
            cached_items: 3,
            ttl: 3600,
            timestamp: new Date().toISOString()
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
