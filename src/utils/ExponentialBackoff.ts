import type { ILogger } from './ILogger';
import { logger as defaultLogger } from './logger';

export interface RetryConfig {
  /** Initial delay in ms (default: 1000) */
  initialDelay: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay: number;
  /** Multiplier for each retry (default: 2) */
  factor: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
};

/**
 * Exponential backoff utility with jitter (§4.4).
 * Calculates delay and executes a retry callback after waiting.
 */
export class ExponentialBackoff {
  private attempt = 0;
  private readonly config: RetryConfig;
  private readonly logger: ILogger;

  constructor(config?: Partial<RetryConfig>, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? defaultLogger;
  }

  /** Calculate the next delay with jitter */
  private getDelay(): number {
    const delay = Math.min(
      this.config.initialDelay * Math.pow(this.config.factor, this.attempt),
      this.config.maxDelay
    );
    // Add jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /** Schedule a retry with exponential backoff */
  scheduleRetry(fn: () => void): void {
    const delay = this.getDelay();
    this.attempt++;
    this.logger.info('Scheduling retry with backoff', {
      attempt: this.attempt,
      delayMs: delay,
    });
    setTimeout(fn, delay);
  }

  /** Reset the attempt counter (e.g., after successful connection) */
  reset(): void {
    this.attempt = 0;
  }
}
