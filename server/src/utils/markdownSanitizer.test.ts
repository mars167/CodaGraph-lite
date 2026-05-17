import { sanitizeMarkdownForStorage, sanitizeMarkdownUrl } from './markdownSanitizer';

describe('markdownSanitizer', () => {
  it('encodes raw HTML while preserving markdown text', () => {
    const markdown = [
      '# Review',
      '',
      '- 标题: <img src=x onerror=alert(1)>',
      '- 描述: <script>alert(1)</script> kept text',
    ].join('\n');

    const sanitized = sanitizeMarkdownForStorage(markdown);

    expect(sanitized).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(sanitized).toContain('&lt;script&gt;alert(1)&lt;/script&gt; kept text');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('<img');
  });

  it('replaces unsafe markdown link protocols', () => {
    expect(sanitizeMarkdownForStorage('[run](javascript:alert(1))')).toBe('[run](#)');
    expect(sanitizeMarkdownForStorage('[run](JaVaScRiPt%3Aalert(1))')).toBe('[run](#)');
    expect(sanitizeMarkdownForStorage('[safe](https://example.com/report)')).toBe('[safe](https://example.com/report)');
  });

  it('allows relative and approved absolute URLs', () => {
    expect(sanitizeMarkdownUrl('/dashboard/reports/1')).toBe('/dashboard/reports/1');
    expect(sanitizeMarkdownUrl('../reports/1')).toBe('../reports/1');
    expect(sanitizeMarkdownUrl('mailto:security@example.com')).toBe('mailto:security@example.com');
    expect(sanitizeMarkdownUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
  });
});
