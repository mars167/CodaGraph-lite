import * as path from 'path';
import type { ReviewFinding } from './reviewEngine';

export interface StoredReviewReportFile {
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  previousPath?: string;
}

export interface StoredReviewReportFileReview {
  filePath: string;
  status?: string;
  language?: string;
  fileSummary?: string;
  findings?: ReviewFinding[];
  patch?: string;
}

export interface ReviewReportPatchFile extends StoredReviewReportFile {
  patch?: string;
}

export interface ReviewReportFinding extends ReviewFinding {
  resolvedLineNumber?: number;
}

export interface ReviewReportCodeLine {
  type: 'add' | 'delete' | 'context' | 'omitted';
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
  content: string;
  findings: ReviewReportFinding[];
}

export interface ReviewReportFileContext {
  filePath: string;
  status?: string;
  language?: string;
  fileSummary?: string;
  additions: number;
  deletions: number;
  changes: number;
  patchAvailable: boolean;
  totalFindings: number;
  generalFindings: ReviewReportFinding[];
  lines: ReviewReportCodeLine[];
}

interface ParsedPatchLine extends ReviewReportCodeLine {
  type: 'add' | 'delete' | 'context';
}

const SECRET_PATTERN = /\b(password|secret|token|api[_-]?key|authorization|bearer|client_secret|access_token|refresh_token)\b/i;
const HTML_PATTERN = /\b(innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|outerHTML)\b/;
const DEBUG_PATTERN = /\b(console\.log|debugger)\b/;
const TODO_PATTERN = /\b(TODO|FIXME|HACK)\b/i;
const EVAL_PATTERN = /\b(eval|new Function)\b/;

function getLanguageFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.java':
      return 'java';
    case '.rs':
      return 'rust';
    case '.json':
      return 'json';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.md':
      return 'markdown';
    case '.sql':
      return 'sql';
    case '.sh':
      return 'bash';
    default:
      return extension.replace(/^\./, '') || 'text';
  }
}

function parsePatch(patch: string): ParsedPatchLine[] {
  const rows: ParsedPatchLine[] = [];
  const lines = patch.split('\n');
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk || line.startsWith('---') || line.startsWith('+++') || line.startsWith('\\')) {
      continue;
    }

    if (line.startsWith('+')) {
      rows.push({
        type: 'add',
        oldLineNumber: null,
        newLineNumber: newLine,
        content: line.slice(1),
        findings: [],
      });
      newLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      rows.push({
        type: 'delete',
        oldLineNumber: oldLine,
        newLineNumber: null,
        content: line.slice(1),
        findings: [],
      });
      oldLine += 1;
      continue;
    }

    rows.push({
      type: 'context',
      oldLineNumber: oldLine,
      newLineNumber: newLine,
      content: line.startsWith(' ') ? line.slice(1) : line,
      findings: [],
    });
    oldLine += 1;
    newLine += 1;
  }

  return rows;
}

function selectInferencePattern(finding: ReviewFinding): RegExp | null {
  const haystack = `${finding.title} ${finding.description} ${finding.suggestion || ''}`.toLowerCase();

  if (haystack.includes('敏感') || haystack.includes('secret') || haystack.includes('token') || haystack.includes('password')) {
    return SECRET_PATTERN;
  }

  if (haystack.includes('html') || haystack.includes('xss')) {
    return HTML_PATTERN;
  }

  if (haystack.includes('调试') || haystack.includes('debug')) {
    return DEBUG_PATTERN;
  }

  if (haystack.includes('todo') || haystack.includes('fixme') || haystack.includes('hack') || haystack.includes('待办')) {
    return TODO_PATTERN;
  }

  if (haystack.includes('eval') || haystack.includes('动态执行')) {
    return EVAL_PATTERN;
  }

  return null;
}

function inferLineNumber(patchRows: ParsedPatchLine[], finding: ReviewFinding): number | undefined {
  const pattern = selectInferencePattern(finding);
  if (pattern) {
    const matchedRow = patchRows.find((row) => row.type === 'add' && pattern.test(row.content));
    if (matchedRow?.newLineNumber) {
      return matchedRow.newLineNumber;
    }
  }

  const addedRow = patchRows.find((row) => row.type === 'add' && row.newLineNumber != null);
  return addedRow?.newLineNumber ?? undefined;
}

function buildExcerptRows(rows: ParsedPatchLine[], targetLines: number[]): ReviewReportCodeLine[] {
  if (rows.length === 0) {
    return [];
  }

  if (rows.length <= 28) {
    return rows;
  }

  if (targetLines.length === 0) {
    return [
      ...rows.slice(0, 16),
      {
        type: 'omitted',
        content: `... 还有 ${Math.max(rows.length - 16, 0)} 行变更未展示`,
        findings: [],
      },
    ];
  }

  const keep = new Set<number>();
  for (const targetLine of targetLines) {
    const targetIndex = rows.findIndex(
      (row) => row.newLineNumber === targetLine || row.oldLineNumber === targetLine
    );

    if (targetIndex === -1) {
      continue;
    }

    for (let index = Math.max(0, targetIndex - 2); index <= Math.min(rows.length - 1, targetIndex + 2); index += 1) {
      keep.add(index);
    }
  }

  if (keep.size === 0) {
    return rows.slice(0, 18);
  }

  const selectedIndexes = Array.from(keep).sort((left, right) => left - right);
  const excerpt: ReviewReportCodeLine[] = [];
  let previousIndex = -1;

  for (const index of selectedIndexes) {
    if (previousIndex !== -1 && index - previousIndex > 1) {
      excerpt.push({
        type: 'omitted',
        content: `... 省略 ${index - previousIndex - 1} 行`,
        findings: [],
      });
    }

    excerpt.push(rows[index]);
    previousIndex = index;
  }

  return excerpt;
}

export function buildReviewReportFileContexts(params: {
  findings: ReviewFinding[];
  files?: StoredReviewReportFile[];
  fileReviews?: StoredReviewReportFileReview[];
  patchFiles?: ReviewReportPatchFile[];
}): ReviewReportFileContext[] {
  const fileMeta = new Map<string, StoredReviewReportFile>();
  const fileReviews = new Map<string, StoredReviewReportFileReview>();
  const patchFiles = new Map<string, ReviewReportPatchFile>();
  const filePaths = new Set<string>();

  for (const file of params.files || []) {
    if (!file?.path) {
      continue;
    }
    fileMeta.set(file.path, file);
    filePaths.add(file.path);
  }

  for (const review of params.fileReviews || []) {
    if (!review?.filePath) {
      continue;
    }
    fileReviews.set(review.filePath, review);
    filePaths.add(review.filePath);
  }

  for (const patchFile of params.patchFiles || []) {
    if (!patchFile?.path) {
      continue;
    }
    patchFiles.set(patchFile.path, patchFile);
    filePaths.add(patchFile.path);
  }

  for (const finding of params.findings) {
    if (finding.filePath && finding.filePath !== 'PR_OVERALL') {
      filePaths.add(finding.filePath);
    }
  }

  return Array.from(filePaths)
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => {
      const baseFile = fileMeta.get(filePath);
      const review = fileReviews.get(filePath);
      const patchFile = patchFiles.get(filePath);
      const patch = patchFile?.patch || review?.patch || '';
      const parsedRows = patch ? parsePatch(patch) : [];
      const targetFindings = params.findings
        .filter((finding) => finding.filePath === filePath)
        .map((finding) => ({ ...finding })) as ReviewReportFinding[];

      const attachedLines = new Set<number>();
      const generalFindings: ReviewReportFinding[] = [];

      for (const finding of targetFindings) {
        const resolvedLineNumber = finding.lineNumber ?? inferLineNumber(parsedRows, finding);
        if (resolvedLineNumber) {
          finding.resolvedLineNumber = resolvedLineNumber;
          const row = parsedRows.find((line) => line.newLineNumber === resolvedLineNumber)
            || parsedRows.find((line) => line.oldLineNumber === resolvedLineNumber);

          if (row) {
            row.findings.push(finding);
            attachedLines.add(resolvedLineNumber);
            continue;
          }
        }

        generalFindings.push(finding);
      }

      return {
        filePath,
        status: review?.status || patchFile?.status || baseFile?.status,
        language: review?.language || getLanguageFromPath(filePath),
        fileSummary: review?.fileSummary,
        additions: patchFile?.additions ?? baseFile?.additions ?? 0,
        deletions: patchFile?.deletions ?? baseFile?.deletions ?? 0,
        changes: patchFile?.changes ?? baseFile?.changes ?? ((patchFile?.additions ?? 0) + (patchFile?.deletions ?? 0)),
        patchAvailable: parsedRows.length > 0,
        totalFindings: targetFindings.length,
        generalFindings,
        lines: buildExcerptRows(parsedRows, Array.from(attachedLines)),
      } satisfies ReviewReportFileContext;
    })
    .filter((context) => context.totalFindings > 0 || context.patchAvailable || Boolean(context.fileSummary));
}
