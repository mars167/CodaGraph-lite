import { annotateDiffWithLineNumbers, mapLineToInlineComment, parseDiffLineMap } from './diffMapper';

describe('diffMapper', () => {
  const diff = [
    '@@ -1,3 +1,4 @@',
    ' export function foo() {',
    '+  console.log("debug")',
    '   return 1',
    ' }',
  ].join('\n');

  it('parses unified diff mappings', () => {
    const mappings = parseDiffLineMap(diff);

    expect(mappings).toEqual([
      { diffLine: 0, fileLine: 1, type: 'context', content: 'export function foo() {' },
      { diffLine: 1, fileLine: 2, type: 'add', content: '  console.log("debug")' },
      { diffLine: 2, fileLine: 3, type: 'context', content: '  return 1' },
      { diffLine: 3, fileLine: 4, type: 'context', content: '}' },
    ]);
  });

  it('annotates diff lines with head file numbers', () => {
    expect(annotateDiffWithLineNumbers(diff)).toContain('    L2 | +  console.log("debug")');
  });

  it('maps head file lines back to inline comment positions', () => {
    expect(mapLineToInlineComment(diff, 2)).toEqual({ line: 2, side: 'RIGHT' });
    expect(mapLineToInlineComment(diff, 99)).toBeNull();
  });
});
