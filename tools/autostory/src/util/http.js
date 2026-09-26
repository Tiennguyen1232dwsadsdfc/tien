import { log } from './log.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(status, statusText, body, url) {
    super(`HTTP ${status} ${statusText} — ${url}\n${String(body).slice(0, 800)}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);

/**
 * fetch + retry co backoff. Chi retry loi mang va cac status tam thoi —
 * 400/401/403 la loi cau hinh, retry chi lam cham va ton quota.
 */
export async function fetchRetry(url, options = {}, { retries = 4, baseDelay = 1500, label = '' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      const err = new HttpError(res.status, res.statusText, body, url);
      if (!RETRYABLE.has(res.status) || attempt === retries) throw err;
      lastErr = err;
    } catch (err) {
      if (err instanceof HttpError && !RETRYABLE.has(err.status)) throw err;
      lastErr = err;
      if (attempt === retries) break;
    }
    const delay = baseDelay * 2 ** attempt;
    log.warn(`${label || url}: ${lastErr.message.split('\n')[0]} — thu lai sau ${delay}ms (${attempt + 1}/${retries})`);
    await sleep(delay);
  }
  throw lastErr;
}

/** Chay cac task song song voi gioi han concurrency, giu nguyen thu tu ket qua. */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export { sleep };
