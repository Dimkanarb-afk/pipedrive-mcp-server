"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
exports.withRateLimit = withRateLimit;
const bottleneck_1 = __importDefault(require("bottleneck"));
/**
 * Pipedrive API rate limits:
 *   - Standard: 80 requests / 2 seconds per company token
 *   - We stay safely under with reservoir: 70 / 2s and minTime: 50ms
 */
exports.rateLimiter = new bottleneck_1.default({
    maxConcurrent: 5,
    minTime: 50,
    reservoir: 70,
    reservoirRefreshAmount: 70,
    reservoirRefreshInterval: 2000,
});
/**
 * Wraps an object so that every method call is scheduled through the rate limiter.
 * Mirrors the WillDent proxy pattern — drop any object in, get a rate-limited version back.
 *
 * Usage:
 *   const client = withRateLimit(new PipedriveClient());
 */
function withRateLimit(instance) {
    return new Proxy(instance, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value === 'function') {
                return (...args) => exports.rateLimiter.schedule(() => 
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                value.apply(target, args));
            }
            return value;
        },
    });
}
//# sourceMappingURL=rate-limiter.js.map