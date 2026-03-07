import { extractJSONFromMarkdown, parseFileReview } from './reviewParser';

describe('reviewParser', () => {
  it('extracts JSON payloads from markdown fences', () => {
    const markdown = '```json\n{"filePath":"a.ts","issues":[],"fileSummary":"ok"}\n```';
    expect(extractJSONFromMarkdown(markdown)).toBe('{"filePath":"a.ts","issues":[],"fileSummary":"ok"}');
  });

  it('parses file review JSON and normalizes line strings', () => {
    const parsed = parseFileReview(`{
      "filePath": "src/app.ts",
      "issues": [
        {
          "line": "12-13",
          "severity": "warning",
          "title": "Missing null check",
          "description": "Potential runtime error",
          "suggestion": "Add a guard"
        }
      ],
      "fileSummary": "App logic changed"
    }`);

    expect(parsed.filePath).toBe('src/app.ts');
    expect(parsed.issues).toEqual([
      {
        line: 12,
        severity: 'WARNING',
        title: 'Missing null check',
        description: 'Potential runtime error',
        suggestion: 'Add a guard',
        codeSnippet: undefined,
      },
    ]);
  });

  it('falls back gracefully when the payload cannot be parsed', () => {
    const parsed = parseFileReview('not json');

    expect(parsed.parseError).toBe(true);
    expect(parsed.issues).toEqual([]);
  });
});
