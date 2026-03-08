const SQLITE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const EXPLICIT_TIMEZONE_PATTERN = /(Z|[+\-]\d{2}:\d{2})$/i;

export const LOCAL_DB_NOW_SQL = "datetime('now', 'localtime')";

export function normalizeApiTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const raw = value.trim();
  if (!raw) {
    return null;
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
    return null;
  }

  return date.toISOString();
}
