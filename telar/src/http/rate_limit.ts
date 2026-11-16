/** Cubeta de tokens en memoria por clave (credencial del webhook o usuario de la API). */
export class RateLimiter {
  readonly #buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}

  take(key: string): boolean {
    const now = this.now();
    const bucket = this.#buckets.get(key) ?? { tokens: this.perMinute, updated: now };
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + ((now - bucket.updated) / 60_000) * this.perMinute);
    bucket.updated = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.#buckets.set(key, bucket);
    if (this.#buckets.size > 10_000) this.#evict(now);
    return allowed;
  }

  #evict(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.updated > 120_000) this.#buckets.delete(key);
    }
  }
}
