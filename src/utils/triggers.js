const SKIP_PREFIXES = ['what is', 'explain', 'why does', 'tell me about'];

const TRIGGER_PHRASES = [
  'this',
  'here',
  'can you see',
  'what should i',
  'where is',
  'how do i',
  "it's not working",
  "doesn't work",
  'what do i click',
  'what does this',
  'look at',
  "i'm stuck",
  'confused',
  'not sure',
  'help me with',
  "what's wrong",
  "can't find",
];

const LONG_MESSAGE_THRESHOLD = 280;
const SHORT_QUESTION_THRESHOLD = 60;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRIGGER_REGEX = new RegExp(
  TRIGGER_PHRASES.map((p) => `\\b${escapeRegex(p)}\\b`).join('|'),
  'i'
);

export function shouldCapture(message) {
  const trimmed = (message ?? '').trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // Skip clearly conceptual messages.
  if (SKIP_PREFIXES.some((p) => lower.startsWith(p))) return false;
  if (trimmed.length > LONG_MESSAGE_THRESHOLD) return false;

  // Short questions are usually about something on screen.
  if (trimmed.endsWith('?') && trimmed.length < SHORT_QUESTION_THRESHOLD) return true;

  return TRIGGER_REGEX.test(lower);
}
