const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Retries `fn` on exception with exponential backoff.
 * @param fn        work to run; throw to trigger a retry
 * @param retries   how many retries (not total attempts) — default 3
 * @param baseMs    initial delay before first retry — default 300ms
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  retries = 3,
  baseMs = 300
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt + 1);
    } catch (err) {
      if (attempt === retries) throw err; // out of tries
      const delay = baseMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * (delay * 0.25)); // ±25% jitter
      await sleep(delay + jitter);
    }
  }
  // unreachable
  throw new Error("retry fell through");
}
