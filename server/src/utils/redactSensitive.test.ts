import {
  formatCommandForLog,
  sanitizeLogText,
  sanitizeSensitiveText,
  sanitizeUnknown,
} from './redactSensitive';

describe('redactSensitive', () => {
  it('redacts credentials embedded in clone URLs', () => {
    const value = 'git clone https://oauth2:ghs_secretToken123@github.com/mars167/CodaGraph-lite.git';

    expect(sanitizeSensitiveText(value)).toBe(
      'git clone https://[REDACTED]@github.com/mars167/CodaGraph-lite.git'
    );
  });

  it('redacts bearer tokens and secret-like key values', () => {
    const value = 'authorization=Bearer abc123 token=ghp_secret password="super-secret"';

    expect(sanitizeSensitiveText(value)).toBe(
      'authorization=[REDACTED] token=[REDACTED] password=[REDACTED]'
    );
  });

  it('redacts command arguments when formatting command text', () => {
    expect(
      formatCommandForLog('git', [
        'clone',
        'https://oauth2:ghs_secretToken123@github.com/mars167/CodaGraph-lite.git',
        '/tmp/repos/workspace',
      ])
    ).toBe('git clone https://[REDACTED]@github.com/mars167/CodaGraph-lite.git /tmp/repos/workspace');
  });

  it('sanitizes error objects and preserves the rest of the stack text', () => {
    const error = new Error('Command failed: https://oauth2:ghs_secretToken123@github.com/test/repo.git');

    expect(sanitizeUnknown(error)).toContain('https://[REDACTED]@github.com/test/repo.git');
    expect(sanitizeUnknown(error)).not.toContain('ghs_secretToken123');
  });

  it('sanitizes before truncating log messages', () => {
    const log = sanitizeLogText(
      'Command failed: git clone https://oauth2:ghs_secretToken123@github.com/test/repo.git',
      80
    );

    expect(log).toContain('https://[REDACTED]@github.com/test/repo.git');
    expect(log).not.toContain('ghs_secretToken123');
  });
});
