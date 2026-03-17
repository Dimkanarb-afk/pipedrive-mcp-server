import Bottleneck from 'bottleneck';

/**
 * Pipedrive API rate limits:
 *   - Standard: 80 requests / 2 seconds per company token
 *   - We stay safely under with reservoir: 70 / 2s and minTime: 50ms
 */
export const rateLimiter = new Bottleneck({
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
export function withRateLimit<T extends object>(instance: T): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) =>
          rateLimiter.schedule(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (value as (...a: unknown[]) => Promise<unknown>).apply(target, args)
          );
      }
      return value;
    },
  });
}
