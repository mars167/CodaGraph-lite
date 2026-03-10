import { sanitizeLogText, sanitizeSensitiveText } from '../utils/redactSensitive';
import type { ReviewFinding } from './reviewEngine';

export type ReviewMode = 'normal' | 'improve';

export interface ReviewToolTrace {
  kind: 'tool';
  stage: string;
  tool: string;
  input: string;
  output: string;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  durationMs: number;
  at: string;
}

export interface ReviewStageTrace {
  kind: 'stage';
  stage: string;
  status: 'started' | 'completed' | 'failed' | 'timeout' | 'skipped';
  detail?: string;
  durationMs?: number;
  at: string;
}

export interface ReviewDecisionTrace {
  kind: 'decision';
  stage: string;
  filePath?: string;
  title?: string;
  action: 'produced' | 'suppressed' | 'fallback';
  reason: string;
  evidenceRefs?: string[];
  at: string;
}

export type ReviewTraceEntry = ReviewToolTrace | ReviewStageTrace | ReviewDecisionTrace;

export interface ReviewTracePayload {
  mode: ReviewMode;
  promptVersion: string;
  generatedAt: string;
  entries: ReviewTraceEntry[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ReviewTraceCollector {
  private readonly entries: ReviewTraceEntry[] = [];
  private readonly stageStarts = new Map<string, number>();

  constructor(
    private readonly mode: ReviewMode,
    private readonly promptVersion: string
  ) {}

  isEnabled(): boolean {
    return this.mode === 'improve';
  }

  stageStarted(stage: string, detail?: string): void {
    if (!this.isEnabled()) {
      return;
    }

    this.stageStarts.set(stage, Date.now());
    this.entries.push({
      kind: 'stage',
      stage,
      status: 'started',
      detail: detail ? sanitizeLogText(detail, 400) : undefined,
      at: nowIso(),
    });
  }

  stageFinished(
    stage: string,
    status: 'completed' | 'failed' | 'timeout' | 'skipped',
    detail?: string
  ): void {
    if (!this.isEnabled()) {
      return;
    }

    const startedAt = this.stageStarts.get(stage);
    this.entries.push({
      kind: 'stage',
      stage,
      status,
      detail: detail ? sanitizeLogText(detail, 500) : undefined,
      durationMs: startedAt ? Date.now() - startedAt : undefined,
      at: nowIso(),
    });
    this.stageStarts.delete(stage);
  }

  tool(
    stage: string,
    tool: string,
    input: string,
    output: string,
    status: 'success' | 'failed' | 'timeout' | 'skipped',
    durationMs: number
  ): void {
    if (!this.isEnabled()) {
      return;
    }

    this.entries.push({
      kind: 'tool',
      stage,
      tool,
      input: sanitizeLogText(input, 500),
      output: sanitizeSensitiveText(output).slice(0, 800),
      status,
      durationMs,
      at: nowIso(),
    });
  }

  decision(
    stage: string,
    action: 'produced' | 'suppressed' | 'fallback',
    reason: string,
    finding?: Pick<ReviewFinding, 'filePath' | 'title'>,
    evidenceRefs?: string[]
  ): void {
    if (!this.isEnabled()) {
      return;
    }

    this.entries.push({
      kind: 'decision',
      stage,
      action,
      reason: sanitizeLogText(reason, 500),
      filePath: finding?.filePath,
      title: finding?.title,
      evidenceRefs: evidenceRefs?.map((item) => sanitizeLogText(item, 220)).slice(0, 6),
      at: nowIso(),
    });
  }

  finalize(): ReviewTracePayload | undefined {
    if (!this.isEnabled()) {
      return undefined;
    }

    return {
      mode: this.mode,
      promptVersion: this.promptVersion,
      generatedAt: nowIso(),
      entries: this.entries,
    };
  }
}
