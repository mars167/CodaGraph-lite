export interface DiffLineMapping {
  diffLine: number;
  fileLine: number;
  type: 'add' | 'delete' | 'context';
  content: string;
}

export interface InlineCommentPosition {
  line: number;
  side: 'LEFT' | 'RIGHT';
}

export function parseDiffLineMap(diffContent: string): DiffLineMapping[] {
  const mappings: DiffLineMapping[] = [];
  const lines = diffContent.split('\n');
  let currentNewLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk || line.startsWith('---') || line.startsWith('+++') || line.startsWith('\\')) {
      continue;
    }

    const diffLine = mappings.length;

    if (line.startsWith('+')) {
      mappings.push({
        diffLine,
        fileLine: currentNewLine,
        type: 'add',
        content: line.slice(1),
      });
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      mappings.push({
        diffLine,
        fileLine: -1,
        type: 'delete',
        content: line.slice(1),
      });
      continue;
    }

    const content = line.startsWith(' ') ? line.slice(1) : line;
    mappings.push({
      diffLine,
      fileLine: currentNewLine,
      type: 'context',
      content,
    });
    currentNewLine += 1;
  }

  return mappings;
}

export function annotateDiffWithLineNumbers(diffContent: string): string {
  const mappings = parseDiffLineMap(diffContent);
  const lines = diffContent.split('\n');
  const annotated: string[] = [];
  let mappingIndex = 0;

  for (const line of lines) {
    if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('\\') || line.length === 0) {
      annotated.push(line);
      continue;
    }

    const isHunkContent = line.startsWith('+') || line.startsWith('-') || line.startsWith(' ');
    if (!isHunkContent || mappingIndex >= mappings.length) {
      annotated.push(line);
      continue;
    }

    const mapping = mappings[mappingIndex];
    mappingIndex += 1;

    const lineLabel = mapping.type === 'delete' ? 'DEL' : `L${mapping.fileLine}`;
    const prefix = mapping.type === 'add'
      ? '+'
      : mapping.type === 'delete'
        ? '-'
        : ' ';

    annotated.push(`${lineLabel.padStart(6)} | ${prefix}${mapping.content}`);
  }

  return annotated.join('\n');
}

export function getChangedHeadLines(diffContent: string): number[] {
  return parseDiffLineMap(diffContent)
    .filter((mapping) => mapping.type !== 'delete' && mapping.fileLine > 0)
    .map((mapping) => mapping.fileLine);
}

export function mapLineToInlineComment(diffContent: string, lineNumber: number): InlineCommentPosition | null {
  const mapping = parseDiffLineMap(diffContent).find(
    (entry) => entry.fileLine === lineNumber && entry.type !== 'delete'
  );

  if (!mapping || mapping.fileLine <= 0) {
    return null;
  }

  return {
    line: mapping.fileLine,
    side: 'RIGHT',
  };
}
