export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

export const formatPercent = (p: number) => `${Math.round(p * 100)}%`;

/** Words in the pages that name the model: fill every `data-pname` slot with the user's name. */
export function setProviderName(name: string) {
  for (const el of document.querySelectorAll("[data-pname]")) el.textContent = name;
}
