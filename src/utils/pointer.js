export const POINTER_TOKEN = 'POINTER';

const COMPLETE_POINTER_RE = /(?:^|\n)POINTER:\s*(\{[^\n]*\})\s*(?=\n|$)/;
const PARTIAL_POINTER_RE = /\n+POINTER:[\s\S]*$/;

export function parsePointer(text) {
  if (!text) return { displayText: text ?? '', pointer: null };

  const m = text.match(COMPLETE_POINTER_RE);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (
        parsed &&
        typeof parsed.x === 'number' &&
        typeof parsed.y === 'number' &&
        Number.isFinite(parsed.x) &&
        Number.isFinite(parsed.y) &&
        parsed.x >= 0 && parsed.x <= 1 &&
        parsed.y >= 0 && parsed.y <= 1
      ) {
        const before = text.slice(0, m.index);
        const after = text.slice(m.index + m[0].length);
        const stitched = (before + after).replace(/\n{3,}/g, '\n\n').trimEnd();
        const label =
          typeof parsed.label === 'string' && parsed.label.trim()
            ? parsed.label.trim()
            : 'Here';
        return {
          displayText: stitched,
          pointer: { x: parsed.x, y: parsed.y, label },
        };
      }
    } catch {
      // fall through
    }
  }

  const partial = text.match(PARTIAL_POINTER_RE);
  if (partial) {
    return {
      displayText: text.slice(0, partial.index).trimEnd(),
      pointer: null,
    };
  }

  return { displayText: text, pointer: null };
}
