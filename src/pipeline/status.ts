import { isPipelineEligible } from '../classify.ts';
import type { Recording } from '../device/types.ts';
import { describeChoice, estimateUsd } from '../ui/select.ts';

import type { PipelineContext } from './context.ts';

/**
 * 今どうなっているかを一目で分かる形にする。
 *
 * 取り込むかどうかを決める前に、何が残っていて費用がどれくらいかが
 * 見えないと判断できない。処理は一切行わない。
 */
export interface StatusReport {
  readonly pending: readonly Recording[];
  readonly totalCount: number;
  readonly meetingCount: number;
  readonly whisperCount: number;
  readonly processedCount: number;
  readonly estimatedUsd: number;
}

export async function collectStatus(context: PipelineContext): Promise<StatusReport> {
  const recordings = await context.device.listRecordings();
  const meetings = recordings.filter((r) => isPipelineEligible(r.kind));
  const pending = meetings.filter((r) => !context.processed.has(r.signature));

  return {
    pending,
    totalCount: recordings.length,
    meetingCount: meetings.length,
    whisperCount: recordings.filter((r) => r.kind === 'whisper').length,
    processedCount: context.processed.size(),
    estimatedUsd: pending.reduce((sum, r) => sum + estimateUsd(r.sizeBytes), 0),
  };
}

/** Raycast にそのまま出せる形に整える */
export function formatStatus(report: StatusReport): string {
  const lines: string[] = [];

  if (report.pending.length === 0) {
    lines.push('未取り込みの会議はありません');
  } else {
    lines.push(
      `未取り込み ${report.pending.length}件（合計 $${report.estimatedUsd.toFixed(2)}）`,
    );
    lines.push('');
    for (const recording of report.pending) {
      lines.push(`  ${describeChoice(recording)}`);
    }
    lines.push('');
    lines.push('取り込むには「HiDock 取り込み」に Rec番号 を渡してください');
  }

  lines.push('');
  lines.push(
    `デバイス上 ${report.totalCount}件` +
      `（会議 ${report.meetingCount} / Wip ${report.whisperCount}）`,
  );

  return lines.join('\n');
}

/** Raycast Extension が読む形。Date は ISO 文字列にする */
export interface StatusJson {
  readonly pending: readonly {
    readonly name: string;
    readonly label: string;
    readonly recordedAt: string;
    readonly sizeBytes: number;
    readonly estimatedUsd: number;
    readonly signature: string;
  }[];
  readonly totalCount: number;
  readonly meetingCount: number;
  readonly whisperCount: number;
  readonly processedCount: number;
  readonly estimatedUsd: number;
}

export function toStatusJson(report: StatusReport): StatusJson {
  return {
    pending: report.pending.map((r) => ({
      name: r.name,
      label: describeChoice(r),
      recordedAt: r.recordedAt.toISOString(),
      sizeBytes: r.sizeBytes,
      estimatedUsd: estimateUsd(r.sizeBytes),
      signature: r.signature,
    })),
    totalCount: report.totalCount,
    meetingCount: report.meetingCount,
    whisperCount: report.whisperCount,
    processedCount: report.processedCount,
    estimatedUsd: report.estimatedUsd,
  };
}
