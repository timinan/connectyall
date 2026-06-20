import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => true });
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and returns the eventual success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => true });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last error after exhausting maxAttempts', async () => {
    const err = new Error('always');
    const fn = vi.fn().mockRejectedValue(err);
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => true });
    // Attach rejection handler before advancing timers so vitest doesn't flag
    // the rejection as unhandled (fake-timers fires rejections before .rejects
    // can register in the same microtask queue).
    const assertion = expect(promise).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const err = new Error('hard');
    const fn = vi.fn().mockRejectedValue(err);
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, shouldRetry: () => false });
    await expect(promise).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff (base × 2^(attempt-1))', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 500, shouldRetry: () => true });
    // First attempt happens synchronously then awaits.
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    // Backoff #1 = 500ms
    await vi.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);
    // Backoff #2 = 1000ms
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(promise).resolves.toBe('ok');
  });

  it('throws synchronously when maxAttempts < 1', async () => {
    const fn = vi.fn();
    await expect(
      withRetry(fn, { maxAttempts: 0, baseDelayMs: 100, shouldRetry: () => true }),
    ).rejects.toThrow(/maxAttempts must be >= 1/);
    expect(fn).not.toHaveBeenCalled();
  });
});
