/**
 * EMAIL PATTERN ANALYZER - JavaScript Implementation
 * Replaces Rust WASM (email-pattern-analyzer.rs)
 * 
 * CRITICAL: Worker cannot use WASM imports in Cloudflare Workers
 * without pre-compilation. This JS version provides identical functionality.
 */

export function analyze_email_pattern(email) {
    if (!email || typeof email !== 'string') {
        return {
            score: 0,
            indicators: [],
            confidence: 0,
            risk_level: 'Low'
        };
    }

    let total_score = 0;
    const indicators = [];

    // 1. Disposable email domains (weight: 40)
    const disposable_domains = [
        'tempmail', 'guerrillamail', '10minutemail', 'throwaway',
        'mailinator', 'trashmail', 'fakeinbox', 'temp-mail',
        'yopmail', 'getnada', 'mohmal', 'dispostable'
    ];

    const email_lower = email.toLowerCase();
    for (const domain of disposable_domains) {
        if (email_lower.includes(domain)) {
            total_score += 40;
            indicators.push({
                pattern: 'disposable_email',
                weight: 40,
                description: `Disposable domain: ${domain}`
            });
            break;
        }
    }

    // 2. Random string pattern (weight: 25)
    // e.g., "asdf1234@gmail.com", "xyz789abc@yahoo.com"
    const local_part = email.split('@')[0] || '';
    const random_regex = /^[a-z0-9]{8,}$/i;
    
    if (random_regex.test(local_part)) {
        const entropy = calculateEntropy(local_part);
        
        if (entropy > 3.5) {  // High entropy = random
            total_score += 25;
            indicators.push({
                pattern: 'high_entropy',
                weight: 25,
                description: `Random string pattern (entropy: ${entropy.toFixed(2)})`
            });
        }
    }

    // 3. Sequential numbers (weight: 20)
    // e.g., "user123456@domain.com"
    const sequential_regex = /\d{5,}/;
    if (sequential_regex.test(email)) {
        total_score += 20;
        indicators.push({
            pattern: 'sequential_numbers',
            weight: 20,
            description: 'Contains 5+ consecutive digits'
        });
    }

    // 4. Generic names (weight: 15)
    const generic_names = [
        'test', 'admin', 'user', 'info', 'contact',
        'support', 'noreply', 'bot', 'demo', 'sample'
    ];

    for (const name of generic_names) {
        if (email_lower.startsWith(name)) {
            total_score += 15;
            indicators.push({
                pattern: 'generic_name',
                weight: 15,
                description: `Generic prefix: ${name}`
            });
            break;
        }
    }

    // 5. Missing dots in local part (weight: 10)
    // Real humans often have firstname.lastname
    if (!local_part.includes('.') && local_part.length > 10) {
        total_score += 10;
        indicators.push({
            pattern: 'no_dot_separator',
            weight: 10,
            description: 'No dot separator in long local part'
        });
    }

    // 6. Plus addressing abuse (weight: 15)
    // e.g., "user+spam123@gmail.com"
    if (email.includes('+')) {
        const plus_part = email.split('+')[1] || '';
        if (plus_part.length > 5) {
            total_score += 15;
            indicators.push({
                pattern: 'plus_addressing_abuse',
                weight: 15,
                description: 'Suspicious plus addressing'
            });
        }
    }

    // 7. Free email provider + suspicious pattern (weight: 10)
    const free_providers = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
    const is_free = free_providers.some(p => email_lower.endsWith(p));

    if (is_free && total_score > 30) {
        total_score += 10;
        indicators.push({
            pattern: 'free_provider_suspicious',
            weight: 10,
            description: 'Free provider with suspicious patterns'
        });
    }

    // Determine risk level
    let risk_level;
    if (total_score <= 30) {
        risk_level = 'Low';
    } else if (total_score <= 60) {
        risk_level = 'Medium';
    } else if (total_score <= 90) {
        risk_level = 'High';
    } else {
        risk_level = 'Critical';
    }

    // Calculate confidence (0-1)
    const confidence = Math.min(total_score / 100, 1.0);

    return {
        score: total_score,
        indicators,
        confidence,
        risk_level
    };
}

/**
 * Calculate Shannon entropy of a string
 * Higher entropy = more random
 */
function calculateEntropy(str) {
    if (!str) return 0;
    
    const len = str.length;
    const frequencies = {};
    
    // Count character frequencies
    for (const char of str) {
        frequencies[char] = (frequencies[char] || 0) + 1;
    }
    
    // Calculate entropy
    let entropy = 0;
    for (const char in frequencies) {
        const p = frequencies[char] / len;
        entropy -= p * Math.log2(p);
    }
    
    return entropy;
}
