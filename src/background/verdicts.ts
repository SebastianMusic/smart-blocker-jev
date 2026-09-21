export interface Verdict {
  decision: "block" | "allow";
  /** undefined when decided by a domain rule rather than jev */
  noul?: number;
  at: number;
}

const MAX_ENTRIES = 5000;

/**
 * URL -> verdict cache, persisted in storage. Owned solely by the background
 * script. `generation` bumps on every flush so that answers to requests made
 * before the flush are discarded instead of written into the fresh cache.
 */
export class VerdictStore {
  private map = new Map<string, Verdict>();
  private loaded: Promise<void> | null = null;
  generation = 0;

  private load(): Promise<void> {
    this.loaded ??= browser.storage.local.get("verdicts").then(({ verdicts }) => {
      for (const [k, v] of Object.entries((verdicts as Record<string, Verdict> | undefined) ?? {})) {
        this.map.set(k, v);
      }
    });
    return this.loaded;
  }

  async get(key: string): Promise<Verdict | undefined> {
    await this.load();
    return this.map.get(key);
  }

  async set(key: string, verdict: Verdict, generation: number): Promise<void> {
    await this.load();
    if (generation !== this.generation) return;
    this.map.delete(key);
    this.map.set(key, verdict);
    while (this.map.size > MAX_ENTRIES) {
      this.map.delete(this.map.keys().next().value!);
    }
    await this.persist();
  }

  async flush(): Promise<void> {
    await this.load();
    this.generation++;
    this.map.clear();
    await this.persist();
  }

  async counts(): Promise<{ total: number; blocked: number }> {
    await this.load();
    let blocked = 0;
    for (const v of this.map.values()) if (v.decision === "block") blocked++;
    return { total: this.map.size, blocked };
  }

  private persist(): Promise<void> {
    return browser.storage.local.set({ verdicts: Object.fromEntries(this.map) });
  }
}
