const SQLITE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const EXPLICIT_TIMEZONE_PATTERN = /(Z|[+\-]\d{2}:\d{2})$/i;

export function normalizeTimestampInput(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const raw = value.trim();
  if (!raw) {
    return undefined;
  }

  let candidate = raw;
  if (SQLITE_TIMESTAMP_PATTERN.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    candidate = EXPLICIT_TIMEZONE_PATTERN.test(normalized)
      ? normalized
      : `${normalized}+08:00`;
  }

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

export function formatDateTime(
  value?: string | null,
  options: {
    withSeconds?: boolean;
    fallback?: string;
  } = {}
): string {
  const { withSeconds = true, fallback = '--' } = options;
  const normalized = normalizeTimestampInput(value);
  if (!normalized) {
    return fallback;
  }

  const date = new Date(normalized);
  return date.toLocaleString('zh-CN', withSeconds ? {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  } : {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
}

export function formatOptionalDateTime(
  value?: string | null,
  options?: { withSeconds?: boolean }
): string | null {
  const normalized = normalizeTimestampInput(value);
  if (!normalized) {
    return null;
  }

  return formatDateTime(normalized, {
    withSeconds: options?.withSeconds,
    fallback: '',
  });
}
