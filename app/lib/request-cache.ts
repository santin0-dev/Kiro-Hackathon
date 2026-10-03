export class RequestCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  private limit: number;
  private ttlMs: number;
  private concurrency: number;
  constructor(limit = 64, ttlMs = 600_000, concurrency = 2) { this.limit = limit; this.ttlMs = ttlMs; this.concurrency = concurrency; }
  async run(key: string, generate: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
    const found = this.entries.get(key);
    if (found && found.expires > Date.now()) { this.entries.delete(key); this.entries.set(key, found); return { value: found.value, cached: true }; }
    if (found) this.entries.delete(key);
    const pending = this.pending.get(key);
    if (pending) return { value: await pending, cached: true };
    if (this.pending.size >= this.concurrency) throw new Error("BUSY");
    const promise = Promise.resolve().then(generate);
    this.pending.set(key, promise);
    try {
      const value = await promise;
      this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
      while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
      return { value, cached: false };
    } finally { this.pending.delete(key); }
  }
}
