import Bottleneck from 'bottleneck';
/**
 * Pipedrive API rate limits:
 *   - Standard: 80 requests / 2 seconds per company token
 *   - We stay safely under with reservoir: 70 / 2s and minTime: 50ms
 */
export declare const rateLimiter: Bottleneck;
/**
 * Wraps an object so that every method call is scheduled through the rate limiter.
 * Mirrors the WillDent proxy pattern — drop any object in, get a rate-limited version back.
 *
 * Usage:
 *   const client = withRateLimit(new PipedriveClient());
 */
export declare function withRateLimit<T extends object>(instance: T): T;
//# sourceMappingURL=rate-limiter.d.ts.map