export const ROADMAP_OFFER_TOKEN = 'ROADMAP_OFFER';

export const ROADMAP_OFFER_TEXT =
  "I think I have a good feel for your project — I can build your personalised learning roadmap in the background while we keep working. Want me to set that up?";

export const ROADMAP_OFFER_ACCEPT_LABEL = 'Yes, set it up';
export const ROADMAP_OFFER_DECLINE_LABEL = 'Maybe later';

export const ROADMAP_ACCEPT_ACK =
  "Got it — I'll build that in the background. Keep going whenever you're ready.";

export const ROADMAP_DECLINE_RESPONSE =
  "No problem — whenever you're ready, head to the Roadmap tab and hit Generate to build it.";

export const ROADMAP_READY_MESSAGE =
  "I've put together a learning path for your project. You can see it in the Roadmap tab — we'll work through it together step by step.";

export const ROADMAP_OFFER_INSTRUCTION = `You may emit the token ${ROADMAP_OFFER_TOKEN} as your ENTIRE response — no other text and no CHIPS line — when you judge the user has shared enough about their project to build a useful learning roadmap. This is typically appropriate after 2 to 4 exchanges in which the user has described what they're building, their experience level, or specific goals. The system will replace your message with an offer and chips. Don't emit ${ROADMAP_OFFER_TOKEN} if the user just asked a specific question that needs answering — answer them first. Only do this once.`;

const OFFER_RE = /^\s*ROADMAP_OFFER\s*(\n+CHIPS:.*)?\s*$/;

export function parseOffer(text) {
  if (!text) return { isOffer: false, isPartial: false };

  if (OFFER_RE.test(text)) {
    return { isOffer: true, displayText: ROADMAP_OFFER_TEXT };
  }

  // Partial detection during streaming: text is a whitespace-free prefix of the token.
  const trimmed = text.trim();
  if (
    trimmed.length > 0 &&
    !/\s/.test(trimmed) &&
    ROADMAP_OFFER_TOKEN.startsWith(trimmed)
  ) {
    return { isOffer: false, isPartial: true };
  }

  return { isOffer: false, isPartial: false };
}
