export const CONCEPT_TOKEN = 'CONCEPT';

export const CONCEPT_INSTRUCTION =
  'Whenever you explain a new term, tool, or technique that the user may want to remember, append it to your message in this format on a new line: CONCEPT:{"term":"Layer Mask","definition":"A layer mask lets you hide or reveal parts of a layer without permanently erasing anything. Think of it as a stencil attached to your layer — black hides, white reveals."} Only add one concept per message, only for genuinely new terms worth remembering, and keep definitions conversational and jargon-free.';

const COMPLETE_CONCEPT_RE = /(?:^|\n)CONCEPT:\s*(\{[^\n]*\})\s*(?=\n|$)/;
const PARTIAL_CONCEPT_RE = /\n+CONCEPT:[\s\S]*$/;

export function parseConcept(text) {
  if (!text) return { displayText: text ?? '', concept: null };

  const m = text.match(COMPLETE_CONCEPT_RE);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (
        parsed &&
        typeof parsed.term === 'string' &&
        typeof parsed.definition === 'string' &&
        parsed.term.trim() &&
        parsed.definition.trim()
      ) {
        const before = text.slice(0, m.index);
        const after = text.slice(m.index + m[0].length);
        const stitched = (before + after).replace(/\n{3,}/g, '\n\n').trimEnd();
        return {
          displayText: stitched,
          concept: {
            term: parsed.term.trim(),
            definition: parsed.definition.trim(),
          },
        };
      }
    } catch {
      // Fall through to partial detection.
    }
  }

  // Hide a partial CONCEPT line during streaming.
  const partial = text.match(PARTIAL_CONCEPT_RE);
  if (partial) {
    return {
      displayText: text.slice(0, partial.index).trimEnd(),
      concept: null,
    };
  }

  return { displayText: text, concept: null };
}
