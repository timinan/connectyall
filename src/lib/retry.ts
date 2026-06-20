// Generic retry wrapper. Used by TranscriptionService + ExtractionService to
// absorb transient API hiccups (5xx, network blips, retryable 429s) without
// surfacing them to the user. Non-retryable errors short-circuit and rethrow.
//
// Backoff: baseDelayMs × 2^(attempt-1). So with baseDelayMs=500, attempts wait
// 500ms then 1000ms; with baseDelayMs=1000, 1000ms then 2000ms.
export type RetryOptions = {
  maxAttempts: number; // total tries INCLUDING the first; 3 = 1 try + 2 retries
  baseDelayMs: number;
  shouldRetry: (err: unknown) => boolean;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === opts.maxAttempts;
      if (isLast || !opts.shouldRetry(err)) throw err;
      const delay = opts.baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
