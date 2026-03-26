/**
 * BEHAVIORAL FINGERPRINT ANALYZER - JavaScript Implementation
 * Replaces Rust WASM (behavioral-fingerprint.rs)
 * 
 * CRITICAL: Worker cannot use WASM imports in Cloudflare Workers
 * without pre-compilation. This JS version provides identical functionality.
 */

import crypto from 'crypto';

export function generate_fingerprint(events) {
    if (!events || !Array.isArray(events) || events.length === 0) {
        return {
            hash: '',
            timing_score: 0,
            diversity_score: 0,
            pattern_type: 'unknown',
            confidence: 0,
            indicators: []
        };
    }

    const indicators = [];

    // 1. Timing analysis - bots have very regular intervals
    const timing_score = analyzeTimingPatterns(events, indicators);

    // 2. Action diversity - bots repeat same actions
    const diversity_score = analyzeActionDiversity(events, indicators);

    // 3. Interaction depth - bots are shallow
    const depth_score = analyzeInteractionDepth(events, indicators);

    // 4. Error rate - bots make no typos/mistakes
    const error_score = analyzeErrorPatterns(events, indicators);

    // Generate unique hash
    const hash = generateBehaviorHash(events);

    // Determine pattern type
    const pattern_type = classifyPattern(timing_score, diversity_score, depth_score);

    // Calculate overall confidence
    const confidence = calculateConfidence(indicators);

    return {
        hash,
        timing_score,
        diversity_score: 100 - diversity_score,  // Invert for consistency
        pattern_type,
        confidence,
        indicators
    };
}

/**
 * Analyze timing patterns - bots have very regular intervals
 */
function analyzeTimingPatterns(events, indicators) {
    if (events.length < 3) {
        return 0;
    }

    // Calculate inter-event intervals
    const intervals = [];
    for (let i = 1; i < events.length; i++) {
        const interval = events[i].timestamp - events[i - 1].timestamp;
        intervals.push(interval);
    }

    // Calculate coefficient of variation (CV)
    const mean = intervals.reduce((sum, x) => sum + x, 0) / intervals.length;
    const variance = intervals.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / intervals.length;
    const std_dev = Math.sqrt(variance);
    const cv = std_dev / mean;

    // Low CV = very regular = bot-like
    let score;
    if (cv < 0.1) {
        indicators.push(`Ultra-regular timing (CV: ${cv.toFixed(3)})`);
        score = 90;
    } else if (cv < 0.3) {
        indicators.push(`Regular timing (CV: ${cv.toFixed(3)})`);
        score = 60;
    } else if (cv < 0.5) {
        score = 30;
    } else {
        score = 10;
    }

    // Check for exact interval matches (e.g., every 10.000 seconds)
    let exact_matches = 0;
    for (let i = 1; i < intervals.length; i++) {
        if (Math.abs(intervals[i] - intervals[i - 1]) < 0.01) {
            exact_matches++;
        }
    }

    const exact_match_ratio = exact_matches / intervals.length;
    if (exact_match_ratio > 0.5) {
        indicators.push(`Exact interval matches: ${(exact_match_ratio * 100).toFixed(0)}%`);
        return 95;
    }

    return score;
}

/**
 * Analyze action diversity - bots repeat same actions
 */
function analyzeActionDiversity(events, indicators) {
    const action_counts = {};

    for (const event of events) {
        const event_type = event.event_type || event.type || 'unknown';
        action_counts[event_type] = (action_counts[event_type] || 0) + 1;
    }

    const unique_actions = Object.keys(action_counts).length;
    const total_actions = events.length;

    // Shannon entropy for diversity
    let entropy = 0;
    for (const count of Object.values(action_counts)) {
        const p = count / total_actions;
        entropy -= p * Math.log2(p);
    }

    // Low entropy = low diversity = bot-like
    const max_entropy = Math.log2(unique_actions);
    const normalized_entropy = max_entropy > 0 ? entropy / max_entropy : 0;

    const score = (1.0 - normalized_entropy) * 100;

    if (normalized_entropy < 0.3) {
        indicators.push(`Low action diversity (${unique_actions} unique of ${total_actions} total)`);
    }

    // Check for single action repetition
    const max_repeat = Math.max(...Object.values(action_counts));
    const repeat_ratio = max_repeat / total_actions;

    if (repeat_ratio > 0.8) {
        indicators.push(`Single action dominates: ${(repeat_ratio * 100).toFixed(0)}%`);
        return 95;
    }

    return score;
}

/**
 * Analyze interaction depth - bots have shallow interactions
 */
function analyzeInteractionDepth(events, indicators) {
    // Count "deep" interactions (e.g., form fills, file uploads, long messages)
    const deep_interactions = events.filter(e => {
        const metadata = e.metadata || {};
        return (
            metadata.depth === 'deep' ||
            (metadata.message_length && parseInt(metadata.message_length) > 50)
        );
    }).length;

    const depth_ratio = deep_interactions / events.length;

    // Bots typically have shallow interactions
    let score;
    if (depth_ratio < 0.1) {
        indicators.push('Very shallow interactions (<10% deep)');
        score = 80;
    } else if (depth_ratio < 0.3) {
        score = 50;
    } else {
        score = 20;
    }

    return score;
}

/**
 * Analyze error patterns - real humans make typos, bots don't
 */
function analyzeErrorPatterns(events, indicators) {
    const errors = events.filter(e => {
        const metadata = e.metadata || {};
        return (
            metadata.has_typo === 'true' ||
            metadata.has_typo === true ||
            (metadata.backspace_count && parseInt(metadata.backspace_count) > 0)
        );
    }).length;

    if (errors === 0 && events.length > 10) {
        indicators.push('No typos/corrections in 10+ interactions');
        return 70;
    }

    const error_rate = errors / events.length;

    // Very low error rate (but not zero) is also suspicious
    if (error_rate < 0.05 && events.length > 5) {
        indicators.push(`Very low error rate: ${(error_rate * 100).toFixed(1)}%`);
        return 50;
    }

    return 0;
}

/**
 * Generate unique behavior hash from events
 */
function generateBehaviorHash(events) {
    const pattern = events.map(e => {
        const event_type = e.event_type || e.type || 'unknown';
        const timestamp = Math.floor(e.timestamp / 100) * 100;  // Round to 100s
        return `${event_type}:${timestamp}`;
    }).join('|');

    // Create SHA-256 hash
    const hash = crypto.createHash('sha256')
        .update(pattern)
        .digest('hex')
        .substring(0, 16);  // First 16 chars

    return hash;
}

/**
 * Classify pattern type based on scores
 */
function classifyPattern(timing_score, diversity_score, depth_score) {
    if (timing_score > 80 && diversity_score > 70) {
        return 'automated_bot';
    } else if (timing_score > 60 && diversity_score > 60) {
        return 'scripted_behavior';
    } else if (depth_score > 70) {
        return 'shallow_engagement';
    } else if (timing_score < 30 && diversity_score < 40) {
        return 'human_like';
    } else {
        return 'suspicious';
    }
}

/**
 * Calculate confidence from indicators
 */
function calculateConfidence(indicators) {
    // More indicators = higher confidence
    const indicator_count = indicators.length;

    if (indicator_count === 0) {
        return 0.1;
    } else if (indicator_count === 1) {
        return 0.4;
    } else if (indicator_count === 2) {
        return 0.7;
    } else {
        return 0.9;
    }
}
