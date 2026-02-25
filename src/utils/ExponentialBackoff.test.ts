import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExponentialBackoff } from './ExponentialBackoff';
import type { ILogger } from './ILogger';

const silentLogger: ILogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

describe('ExponentialBackoff', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('programa un retry con setTimeout', () => {
        const backoff = new ExponentialBackoff(
            { initialDelay: 1000, maxDelay: 30000, factor: 2 },
            silentLogger
        );
        const callback = vi.fn();

        backoff.scheduleRetry(callback);

        expect(callback).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(callback).toHaveBeenCalledOnce();
    });

    it('incrementa el delay con cada intento', () => {
        const backoff = new ExponentialBackoff(
            { initialDelay: 100, maxDelay: 100000, factor: 2 },
            silentLogger
        );
        const callback = vi.fn();

        // Capture delays from logger calls
        const delays: number[] = [];
        vi.mocked(silentLogger.info).mockImplementation((_msg, ctx) => {
            if (ctx && 'delayMs' in ctx) {
                delays.push(ctx.delayMs as number);
            }
        });

        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        backoff.scheduleRetry(callback);
        vi.runAllTimers();

        // Delays should generally increase (accounting for ±25% jitter)
        // attempt 0: base 100, attempt 1: base 200, attempt 2: base 400
        expect(delays[0]).toBeGreaterThanOrEqual(75);   // 100 - 25%
        expect(delays[0]).toBeLessThanOrEqual(125);      // 100 + 25%
        expect(delays[1]).toBeGreaterThanOrEqual(150);   // 200 - 25%
        expect(delays[1]).toBeLessThanOrEqual(250);      // 200 + 25%
        expect(delays[2]).toBeGreaterThanOrEqual(300);   // 400 - 25%
        expect(delays[2]).toBeLessThanOrEqual(500);      // 400 + 25%
    });

    it('no excede maxDelay', () => {
        const backoff = new ExponentialBackoff(
            { initialDelay: 1000, maxDelay: 2000, factor: 10 },
            silentLogger
        );
        const callback = vi.fn();

        const delays: number[] = [];
        vi.mocked(silentLogger.info).mockImplementation((_msg, ctx) => {
            if (ctx && 'delayMs' in ctx) {
                delays.push(ctx.delayMs as number);
            }
        });

        // After attempt 0: base = min(1000*10^0, 2000) = 1000
        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        // After attempt 1: base = min(1000*10^1, 2000) = 2000
        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        // After attempt 2: base = min(1000*10^2, 2000) = 2000
        backoff.scheduleRetry(callback);
        vi.runAllTimers();

        // Second and third delays should be capped at 2000 ± 25%
        expect(delays[1]).toBeLessThanOrEqual(2500);
        expect(delays[2]).toBeLessThanOrEqual(2500);
    });

    it('reset() reinicia el contador de intentos', () => {
        const backoff = new ExponentialBackoff(
            { initialDelay: 100, maxDelay: 100000, factor: 2 },
            silentLogger
        );
        const callback = vi.fn();

        const delays: number[] = [];
        vi.mocked(silentLogger.info).mockImplementation((_msg, ctx) => {
            if (ctx && 'delayMs' in ctx) {
                delays.push(ctx.delayMs as number);
            }
        });

        // 3 retries to increase the attempt counter
        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        backoff.scheduleRetry(callback);
        vi.runAllTimers();

        // Reset and retry — should be back to initial delay range
        backoff.reset();
        backoff.scheduleRetry(callback);
        vi.runAllTimers();

        const lastDelay = delays[delays.length - 1];
        expect(lastDelay).toBeGreaterThanOrEqual(75);  // 100 - 25%
        expect(lastDelay).toBeLessThanOrEqual(125);     // 100 + 25%
    });

    it('usa config por defecto si no se provee', () => {
        const backoff = new ExponentialBackoff();
        const callback = vi.fn();

        // Should not throw
        backoff.scheduleRetry(callback);
        vi.runAllTimers();
        expect(callback).toHaveBeenCalledOnce();
    });

    it('loguea attempt number al programar retry', () => {
        const backoff = new ExponentialBackoff(
            { initialDelay: 100, maxDelay: 10000, factor: 2 },
            silentLogger
        );

        backoff.scheduleRetry(vi.fn());

        expect(silentLogger.info).toHaveBeenCalledWith(
            'Scheduling retry with backoff',
            expect.objectContaining({ attempt: 1 })
        );
    });
});
