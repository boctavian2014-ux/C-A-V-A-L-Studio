/** Detect user requests for the Fashion Product Matching Engine scaffold. */
export function isFashionMatchingEngineRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes('product matching engine')) return true;
  if (t.includes('product matching') && (t.includes('fashion') || t.includes('haine'))) return true;
  if (t.includes('matching engine') && (t.includes('fashion') || t.includes('haine'))) return true;
  if (t.includes('fashion') && (t.includes('faiss') || t.includes('embedding') || t.includes('variant resolver'))) {
    return true;
  }
  if (t.includes('normalizare') && t.includes('matching') && t.includes('produs')) return true;
  return false;
}

/** Model refusals we replace with local scaffold guidance. */
export function isLlmRefusal(content: string): boolean {
  const t = content.toLowerCase();
  const markers = [
    'nu am capacitatea',
    'cannot generate code',
    "can't generate code",
    'cannot generate',
    'asistent digital',
    'ask a developer',
    'dezvoltator software',
    'not able to generate',
    'do not have the ability',
    'nu pot genera cod',
  ];
  return markers.some((m) => t.includes(m));
}
