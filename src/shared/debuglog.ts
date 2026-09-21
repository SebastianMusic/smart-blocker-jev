export interface DebugEntry {
  at: number;
  url: string;
  /** "block" | "allow" on success, otherwise the error message */
  result: string;
  noul?: number;
  threshold: number;
  strict?: boolean;
  status: number | null;
  ms: number;
  request: unknown;
  response: string;
}

const MAX_ENTRIES = 50;

// Session storage lives in memory and is wiped when Firefox closes; the log holds page content.
let chain: Promise<unknown> = Promise.resolve();

export function appendDebug(entry: DebugEntry): Promise<void> {
  const run = chain.then(async () => {
    const log = await readDebugLog();
    await browser.storage.session.set({ debugLog: [entry, ...log].slice(0, MAX_ENTRIES) });
  });
  chain = run.catch(() => undefined);
  return run;
}

export async function readDebugLog(): Promise<DebugEntry[]> {
  const { debugLog } = await browser.storage.session.get("debugLog");
  return (debugLog as DebugEntry[] | undefined) ?? [];
}

export function clearDebugLog(): Promise<void> {
  return browser.storage.session.remove("debugLog");
}
