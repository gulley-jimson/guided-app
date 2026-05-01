// Match either a fully-qualified http(s) URL OR a bare domain ending in one of the
// listed common TLDs. The negative lookbehind `(?<!@)` skips emails so we don't
// pick up `bob@example.com` as a clickable URL.
const URL_RE =
  /https?:\/\/[^\s<>"'`]+|(?<!@)\b[a-z][a-z0-9-]+\.(?:com|co|io|app|ai|org|net)\b(?:\/[^\s<>"'`]*)?/gi;

const TRAILING_PUNCT_RE = /[.,;:!?)\]'"`]+$/;

export function linkify(text) {
  if (typeof text !== 'string' || !text) {
    return [{ type: 'text', value: text ?? '' }];
  }

  const parts = [];
  let lastIndex = 0;
  URL_RE.lastIndex = 0;

  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[0];
    let trailing = '';
    const trail = url.match(TRAILING_PUNCT_RE);
    if (trail) {
      trailing = trail[0];
      url = url.slice(0, -trailing.length);
    }
    if (!url) continue;

    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    }
    parts.push({ type: 'link', value: url });
    if (trailing) parts.push({ type: 'text', value: trailing });
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
}

export function resolveLinkUrl(href) {
  if (typeof href !== 'string') return '';
  return /^https?:\/\//i.test(href) ? href : `https://${href}`;
}
