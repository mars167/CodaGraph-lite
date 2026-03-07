export type ParsedSeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'NIT';

export interface ParsedReviewIssue {
  line: number;
  severity: ParsedSeverity;
  title: string;
  description: string;
  suggestion: string;
  codeSnippet?: string;
}

export interface ParsedFileReview {
  filePath: string;
  issues: ParsedReviewIssue[];
  fileSummary: string;
  parseError?: boolean;
}

function parseLineField(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const raw = trimmed.includes('-') ? trimmed.split('-')[0].trim() : trimmed;
    const parsed = parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  throw new Error(`Invalid line value: ${String(value)}`);
}

export function extractJSONFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match?.[1]?.trim() ?? null;
}

function normalizeSeverity(value: unknown): ParsedSeverity | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === 'CRITICAL' ||
    normalized === 'WARNING' ||
    normalized === 'SUGGESTION' ||
    normalized === 'NIT'
  ) {
    return normalized;
  }

  return null;
}

export function parseFileReview(rawOutput: string): ParsedFileReview {
  try {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      const extracted = extractJSONFromMarkdown(rawOutput);
      if (!extracted) {
        throw new Error('No JSON payload found');
      }
      parsed = JSON.parse(extracted);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Parsed payload is not an object');
    }

    const payload = parsed as Record<string, unknown>;
    const filePath = typeof payload.filePath === 'string' ? payload.filePath : 'unknown';
    const fileSummary = typeof payload.fileSummary === 'string' ? payload.fileSummary : rawOutput.slice(0, 200);
    const rawIssues = Array.isArray(payload.issues) ? payload.issues : [];

    const issues = rawIssues.flatMap((issue) => {
      if (!issue || typeof issue !== 'object') {
        return [];
      }

      const record = issue as Record<string, unknown>;
      const severity = normalizeSeverity(record.severity);
      if (!severity) {
        return [];
      }

      try {
        const line = parseLineField(record.line);
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        const description = typeof record.description === 'string' ? record.description.trim() : '';
        const suggestion = typeof record.suggestion === 'string' ? record.suggestion.trim() : '';
        const codeSnippet = typeof record.codeSnippet === 'string' ? record.codeSnippet : undefined;

        if (!title || !description || !suggestion) {
          return [];
        }

        return [{
          line,
          severity,
          title,
          description,
          suggestion,
          codeSnippet,
        }];
      } catch {
        return [];
      }
    });

    return {
      filePath,
      issues,
      fileSummary,
    };
  } catch {
    return {
      filePath: 'unknown',
      issues: [],
      fileSummary: rawOutput.slice(0, 400) || 'LLM 输出解析失败',
      parseError: true,
    };
  }
}
