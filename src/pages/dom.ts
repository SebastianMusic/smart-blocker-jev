export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

export const formatPercent = (p: number) => `${Math.round(p * 100)}%`;
