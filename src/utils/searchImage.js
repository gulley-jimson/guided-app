export const SEARCH_IMAGE_TOKEN = 'SEARCH_IMAGE';

const COMPLETE_RE = /(?:^|\n)SEARCH_IMAGE:\s*(\{[^\n]*\})\s*(?=\n|$)/;
const PARTIAL_RE = /\n+SEARCH_IMAGE:[\s\S]*$/;

export function parseSearchImage(text) {
  if (!text) return { displayText: text ?? '', searchQuery: null };

  const m = text.match(COMPLETE_RE);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      const query = typeof parsed?.query === 'string' ? parsed.query.trim() : '';
      if (query) {
        const before = text.slice(0, m.index);
        const after = text.slice(m.index + m[0].length);
        return {
          displayText: (before + after).replace(/\n{3,}/g, '\n\n').trimEnd(),
          searchQuery: query,
        };
      }
    } catch {
      // fall through to partial detection
    }
  }

  const partial = text.match(PARTIAL_RE);
  if (partial) {
    return {
      displayText: text.slice(0, partial.index).trimEnd(),
      searchQuery: null,
    };
  }

  return { displayText: text, searchQuery: null };
}
