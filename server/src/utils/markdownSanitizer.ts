const RAW_HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const RAW_HTML_TAG_PATTERN = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:[^<>]*)?>/g;
const MARKDOWN_LINK_DESTINATION_PATTERN = /(\]\()((?:[^()\s]+|\([^()\s]*\))+)(\))/g;
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function encodeHtmlToken(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeUrlForProtocolCheck(value: string): string {
  let decoded = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded.toLowerCase();
}

function hasExplicitProtocol(value: string): boolean {
  const colon = value.indexOf(':');
  if (colon === -1) {
    return false;
  }

  const slash = value.indexOf('/');
  const questionMark = value.indexOf('?');
  const hash = value.indexOf('#');

  return !(
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (hash !== -1 && colon > hash)
  );
}

export function sanitizeMarkdownUrl(value: string): string {
  const trimmed = value.trim().replace(/^<|>$/g, '');
  const normalized = decodeUrlForProtocolCheck(trimmed);

  if (!hasExplicitProtocol(normalized)) {
    return trimmed;
  }

  const protocol = normalized.slice(0, normalized.indexOf(':') + 1);
  return SAFE_URL_PROTOCOLS.has(protocol) ? trimmed : '#';
}

export function sanitizeMarkdownForStorage(value: string): string {
  return value
    .replace(RAW_HTML_COMMENT_PATTERN, (match) => encodeHtmlToken(match))
    .replace(RAW_HTML_TAG_PATTERN, (match) => encodeHtmlToken(match))
    .replace(MARKDOWN_LINK_DESTINATION_PATTERN, (_match, open: string, url: string, close: string) => (
      `${open}${sanitizeMarkdownUrl(url)}${close}`
    ));
}
