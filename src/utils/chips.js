const COMPLETE_CHIPS_RE = /\n*(CHIPS_MULTI|CHIPS):\s*(\[[\s\S]*?\])\s*$/;
const PARTIAL_CHIPS_RE = /\n+(CHIPS_MULTI|CHIPS):[\s\S]*$/;

export function splitChips(text) {
  if (!text) return { displayText: '', chips: null, chipsMulti: false };

  const complete = text.match(COMPLETE_CHIPS_RE);
  if (complete) {
    try {
      const parsed = JSON.parse(complete[2]);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
        return {
          displayText: text.slice(0, complete.index).trimEnd(),
          chips: parsed,
          chipsMulti: complete[1] === 'CHIPS_MULTI',
        };
      }
    } catch {}
  }

  const partial = text.match(PARTIAL_CHIPS_RE);
  if (partial) {
    return {
      displayText: text.slice(0, partial.index).trimEnd(),
      chips: null,
      chipsMulti: false,
    };
  }

  return { displayText: text, chips: null, chipsMulti: false };
}
