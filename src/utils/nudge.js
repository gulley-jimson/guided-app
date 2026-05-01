export const NUDGE_TOKEN = 'PHASE_COMPLETE_NUDGE';

export const NUDGE_PROMPT_TEXT =
  "Looks like you've nailed this phase! Ready to mark it complete?";

export const NUDGE_COMPLETE_LABEL = 'Mark phase complete';
export const NUDGE_DISMISS_LABEL = 'Not yet';

export const PHASE_COMPLETE_CONFIRMATION =
  'Nice work! Moving on to the next phase — you can see your progress in the Roadmap tab.';

const COMPLETE_RE = /(?:^|\n)PHASE_COMPLETE_NUDGE(?=\n|$)/;

export function splitNudge(text) {
  if (!text) return { hasNudge: false, displayText: '' };

  const match = text.match(COMPLETE_RE);
  if (match) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const joined = (before.trimEnd() + (after ? '\n' + after.trimStart() : '')).trim();
    return { hasNudge: true, displayText: joined };
  }

  // Partial token at the end of streaming text — strip it so the user doesn't
  // briefly see "PHASE_COMPL…" before the full token resolves.
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline !== -1) {
    const lastLine = text.slice(lastNewline + 1).trim();
    if (
      lastLine.length > 0 &&
      lastLine !== NUDGE_TOKEN &&
      NUDGE_TOKEN.startsWith(lastLine) &&
      !/\s/.test(lastLine)
    ) {
      return {
        hasNudge: false,
        displayText: text.slice(0, lastNewline).trimEnd(),
      };
    }
  }

  return { hasNudge: false, displayText: text };
}
