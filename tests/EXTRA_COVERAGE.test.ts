import { describe, it, expect, vi } from 'vitest';
import { ExponentialBackoff } from '../src/utils/ExponentialBackoff';
import { metrics } from '../src/utils/metrics';
import { PriorityResolver } from '../src/strategies/PriorityResolver';
import { IncidentType, Priority } from '../src/types';
import { isIncidentType } from '../src/utils/typeGuards';

describe('Consumer — Extra Coverage', () => {

    describe('ExponentialBackoff', () => {
        it('should calculate delay and increment attempt', () => {
            vi.useFakeTimers();
            const config = { initialDelay: 100, factor: 2 };
            const backoff = new ExponentialBackoff(config);
            const fn = vi.fn();

            backoff.scheduleRetry(fn);
            // Delay for attempt 0 is 100 + jitter
            // 25% jitter on 100 is +/- 25ms. range [75, 125]
            vi.advanceTimersByTime(126);
            expect(fn).toHaveBeenCalledTimes(1);

            backoff.reset();
            // Should reset attempt to 0
            vi.useRealTimers();
        });
    });

    describe('Metrics', () => {
        it('should track snapshots correctly', () => {
            const initial = metrics.getSnapshot();
            metrics.incrementProcessed();
            metrics.incrementRejected();
            metrics.incrementRetried();
            const snapshot = metrics.getSnapshot();

            expect(snapshot.messagesProcessed).toBe(initial.messagesProcessed + 1);
            expect(snapshot.messagesRejected).toBe(initial.messagesRejected + 1);
            expect(snapshot.messagesRetried).toBe(initial.messagesRetried + 1);
            expect(snapshot.uptime).toBeDefined();
        });
    });

    describe('TypeGuards', () => {
        it('should validate incident types', () => {
            expect(isIncidentType('NO_SERVICE')).toBe(true);
            expect(isIncidentType('INVALID')).toBe(false);
            expect(isIncidentType(null)).toBe(false);
        });
    });

    describe('PriorityResolver & Strategies', () => {
        const resolver = new PriorityResolver();

        it('should resolve HIGH for NO_SERVICE', () => {
            expect(resolver.resolve(IncidentType.NO_SERVICE)).toBe(Priority.HIGH);
        });

        it('should resolve MEDIUM for INTERMITTENT_SERVICE', () => {
            expect(resolver.resolve(IncidentType.INTERMITTENT_SERVICE)).toBe(Priority.MEDIUM);
        });

        it('should resolve MEDIUM for SLOW_CONNECTION', () => {
            expect(resolver.resolve(IncidentType.SLOW_CONNECTION)).toBe(Priority.MEDIUM);
        });

        it('should resolve LOW for ROUTER_ISSUE', () => {
            expect(resolver.resolve(IncidentType.ROUTER_ISSUE)).toBe(Priority.LOW);
        });

        it('should resolve LOW for BILLING_QUESTION', () => {
            expect(resolver.resolve(IncidentType.BILLING_QUESTION)).toBe(Priority.LOW);
        });

        it('should resolve PENDING for OTHER', () => {
            expect(resolver.resolve(IncidentType.OTHER)).toBe(Priority.PENDING);
        });

        it('should resolve PENDING for unknown types', () => {
            expect(resolver.resolve('UNKNOWN' as any)).toBe(Priority.PENDING);
        });
    });
});
