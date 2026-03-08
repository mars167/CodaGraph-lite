const URL_CREDENTIALS_PATTERN = /\b(https?:\/\/)([^@\s/]+)@/gi;
const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi;
const SECRET_KEY_VALUE_PATTERN =
  /((?:"|')?(?:token|secret|password|authorization|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|webhook[_-]?secret)(?:"|')?\s*[:=]\s*)(?:(?:Bearer|Basic)\s+[^\s,;]+|"(?:[^"\r\n]*)"|'(?:[^'\r\n]*)'|[^\s,;]+)/gi;
const GITHUB_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;

function redactUrlCredentials(value: string): string {
  return value.replace(URL_CREDENTIALS_PATTERN, '$1[REDACTED]@');
}

export function sanitizeSensitiveText(value: string): string {
  return redactUrlCredentials(value)
    .replace(AUTH_SCHEME_PATTERN, '$1 [REDACTED]')
    .replace(SECRET_KEY_VALUE_PATTERN, '$1[REDACTED]')
    .replace(GITHUB_TOKEN_PATTERN, '[REDACTED_TOKEN]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]');
}

export function sanitizeUnknown(value: unknown): string {
  if (value instanceof Error) {
    return sanitizeSensitiveText(value.stack || value.message);
  }

  return sanitizeSensitiveText(String(value));
}

export function truncateForLog(value: string, maxLength = 220): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function sanitizeLogText(value: string, maxLength = 220): string {
  return truncateForLog(sanitizeSensitiveText(value), maxLength);
}

export function formatCommandForLog(command: string, args: string[]): string {
  return sanitizeSensitiveText([command, ...args].join(' '));
}
