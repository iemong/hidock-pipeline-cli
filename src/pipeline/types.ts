import type { Recording } from '../device/types.ts';

export type SkipReason =
  | 'not-selected'
  | 'not-meeting'
  | 'already-processed'
  | 'too-short'
  | 'download-failed'
  | 'generation-failed';

export interface ProcessedResult {
  readonly status: 'processed';
  readonly recording: Recording;
  readonly notePath: string;
  readonly durationSeconds: number;
  readonly costUsd: number;
  readonly attempts: number;
}

export interface SkippedResult {
  readonly status: 'skipped';
  readonly recording: Recording;
  readonly reason: SkipReason;
  readonly detail: string;
}

export type RecordingResult = ProcessedResult | SkippedResult;

export interface PipelineSummary {
  readonly results: readonly RecordingResult[];
  readonly processed: readonly ProcessedResult[];
  readonly totalCostUsd: number;
}

export function summarize(results: readonly RecordingResult[]): PipelineSummary {
  const processed = results.filter((r): r is ProcessedResult => r.status === 'processed');

  return {
    results,
    processed,
    totalCostUsd: processed.reduce((sum, r) => sum + r.costUsd, 0),
  };
}

/** 通知に出す一行。何が起きたかを人間が読む唯一の場所になる */
export function describeSummary(summary: PipelineSummary): string {
  const { processed, results } = summary;
  const skipped = results.length - processed.length;

  if (processed.length === 0) {
    return skipped === 0
      ? 'No new recordings.'
      : `Nothing imported (${skipped} skipped).`;
  }

  const cost = summary.totalCostUsd.toFixed(3);
  return `Created ${processed.length} meeting note(s) ($${cost}).`;
}
