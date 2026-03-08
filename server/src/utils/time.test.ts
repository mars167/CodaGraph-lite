import { normalizeApiTimestamp } from './time';

describe('time utils', () => {
  it('treats sqlite datetime strings as Asia/Shanghai local time', () => {
    expect(normalizeApiTimestamp('2026-03-08 20:38:50')).toBe('2026-03-08T12:38:50.000Z');
  });

  it('preserves ISO timestamps with explicit timezone', () => {
    expect(normalizeApiTimestamp('2026-03-08T12:38:50.000Z')).toBe('2026-03-08T12:38:50.000Z');
    expect(normalizeApiTimestamp('2026-03-08T20:38:50+08:00')).toBe('2026-03-08T12:38:50.000Z');
  });

  it('returns null for invalid timestamps', () => {
    expect(normalizeApiTimestamp('not-a-date')).toBeNull();
  });
});
