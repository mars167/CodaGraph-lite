export interface FilePromptContext {
  filePath: string;
  language: string;
  annotatedDiff: string;
  semanticContext: {
    changedSymbols: string[];
    relatedSnippets: string[];
    impactReferences: string[];
    relatedTests: string[];
    contextEngineAvailable: boolean;
  };
  fileContent?: string;
}

export const REVIEW_PROMPT_VERSION = '2026-03-10-impact-security-logic-v1';

export interface OverallPromptContext {
  prTitle: string;
  fileSummaries: Array<{
    filePath: string;
    language: string;
    summary: string;
    findingCount: number;
  }>;
  topFindings: Array<{
    filePath: string;
    severity: string;
    title: string;
  }>;
  hasTests: boolean;
}

export function buildSystemPrompt(language: string): string {
  return `You are CodaGraph Lite Review Agent, a senior ${language} code reviewer.

Prioritize only high-signal issues:
- logic regressions and broken invariants
- security boundary violations and secret handling problems
- call-chain or dependency impact that can break other modules
- missing tests for risky behavioral changes
- performance problems with real production impact
- maintainability issues only when they are likely to cause future defects

Do NOT spend comments on:
- formatting, naming, import ordering, or stylistic preferences
- low-value cleanup notes unless they materially affect correctness
- speculative complaints without concrete evidence in the diff or context

Rules:
- Respond in Simplified Chinese.
- Return valid JSON only.
- Use the exact line numbers from the annotated diff (L<number>).
- Only report issues that are actionable and worth commenting on in a PR.
- Every issue MUST include line, severity, title, description, and suggestion.
- Severity must be one of CRITICAL, WARNING, SUGGESTION, NIT.`;
}

function formatSemanticContext(context: FilePromptContext['semanticContext']): string {
  const sections: string[] = [];

  if (context.changedSymbols.length > 0) {
    sections.push(`Changed symbols: ${context.changedSymbols.join(', ')}`);
  }

  if (context.impactReferences.length > 0) {
    sections.push(`Impact references:\n${context.impactReferences.map((item) => `- ${item}`).join('\n')}`);
  }

  if (context.relatedTests.length > 0) {
    sections.push(`Related tests:\n${context.relatedTests.map((item) => `- ${item}`).join('\n')}`);
  }

  if (context.relatedSnippets.length > 0) {
    sections.push(`Related snippets:\n${context.relatedSnippets.map((item) => `- ${item}`).join('\n')}`);
  }

  sections.push(`Code retrieval runtime available: ${context.contextEngineAvailable ? 'yes' : 'no'}`);

  return sections.join('\n\n');
}

export function buildFileReviewPrompt(context: FilePromptContext): string {
  const fileContentSection = context.fileContent
    ? `### 文件内容上下文\n\`\`\`${context.language}\n${context.fileContent}\n\`\`\`\n\n`
    : '';

  return `## 文件
${context.filePath}

## 任务
基于 diff、文件内容和语义上下文，按以下顺序审查：
1. 调用链/依赖影响
2. 安全边界与不可信输入
3. 逻辑正确性、状态转换、错误处理、部分失败
4. 性能与资源风险
5. 仅在会导致缺陷时才提 maintainability 问题

忽略纯样式或低价值噪音。

${fileContentSection}### Annotated Diff
\`\`\`diff
${context.annotatedDiff}
\`\`\`

### 语义上下文
${formatSemanticContext(context.semanticContext)}

请只返回 JSON：
\`\`\`json
{
  "filePath": "${context.filePath}",
  "issues": [
    {
      "line": 42,
      "severity": "WARNING",
      "title": "缺少边界校验",
      "description": "说明为什么这是个真实问题。",
      "suggestion": "给出可以直接落地的修复建议。"
    }
  ],
  "fileSummary": "一句话总结该文件的改动和风险。"
}
\`\`\``;
}

export function buildOverallReviewPrompt(context: OverallPromptContext): string {
  return `请基于以下 PR 摘要做跨文件 review，只关注以下高价值问题：
- 跨文件行为不一致
- 调用链或依赖影响
- API / 配置 / 权限边界变化
- 缺少测试导致的回归风险
- 部分失败、回滚、重试或状态一致性风险

PR 标题: ${context.prTitle}
是否包含测试变更: ${context.hasTests ? '是' : '否'}

### 文件摘要
${context.fileSummaries.map((item) => `- ${item.filePath} (${item.language}): ${item.summary} [issues=${item.findingCount}]`).join('\n')}

### 重点问题
${context.topFindings.length > 0 ? context.topFindings.map((item) => `- ${item.filePath}: [${item.severity}] ${item.title}`).join('\n') : '- 无'}

请只返回 JSON：
\`\`\`json
{
  "filePath": "PR_OVERALL",
  "issues": [
    {
      "line": 1,
      "severity": "WARNING",
      "title": "缺少测试覆盖",
      "description": "说明跨文件风险。",
      "suggestion": "给出修复或补充测试建议。"
    }
  ],
  "fileSummary": "一句话总结整个 PR 的总体风险。"
}
\`\`\``;
}
