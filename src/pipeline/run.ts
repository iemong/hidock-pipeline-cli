import { isPipelineEligible } from '../classify.ts';
import type { Recording } from '../device/types.ts';
import { chooseRecordings } from '../ui/select.ts';

import type { PipelineContext } from './context.ts';
import { processRecording } from './process-one.ts';
import { type PipelineSummary, type RecordingResult, summarize } from './types.ts';

export interface RunOptions {
  /**
   * 選択ダイアログを出さず、対象を全て処理する。
   * 自動実行（launchd）から呼ぶ場合に使う。
   */
  readonly selectAll?: boolean | undefined;
  /**
   * 名前に含まれる文字列で対象を指定する（例: "Rec14"）。
   * Raycast の引数から渡すためのもので、指定されればダイアログを出さない。
   */
  readonly pick?: string | undefined;
}

export class NoMatchError extends Error {
  constructor(pick: string, candidates: readonly Recording[]) {
    const list = candidates.map((r) => r.name).join(', ');
    super(
      `「${pick}」に該当する未取り込みの会議がありません。` +
        (list === '' ? '' : ` 候補: ${list}`),
    );
    this.name = 'NoMatchError';
  }
}

function matchByName(
  candidates: readonly Recording[],
  pick: string,
): readonly Recording[] {
  const needle = pick.trim().toLowerCase();
  const matched = candidates.filter((r) => r.name.toLowerCase().includes(needle));

  if (matched.length === 0) {
    throw new NoMatchError(pick, candidates);
  }
  return matched;
}

/** ダイアログに出す候補。会議で、まだ取り込んでいないもの */
function pickCandidates(
  context: PipelineContext,
  recordings: readonly Recording[],
): readonly Recording[] {
  return recordings.filter(
    (r) => isPipelineEligible(r.kind) && !context.processed.has(r.signature),
  );
}

/**
 * 録音を処理する。
 *
 * 既定では取り込む会議を選ばせる。全部を勝手に処理しないのは、
 * 会議によって残す価値が違い、費用も発生するため。
 * 選ぶ工程を軽く保つことが、この方式が続くかどうかを決める。
 *
 * 処理は逐次で行う。USB 転送は並列にできず、並列化しても速くならない。
 */
export async function runPipeline(
  context: PipelineContext,
  options: RunOptions = {},
): Promise<PipelineSummary> {
  const recordings = await context.device.listRecordings();
  const candidates = pickCandidates(context, recordings);

  const chosen = await selectTargets(context, candidates, options);

  const selected = new Set(chosen.map((r) => r.signature));
  const results: RecordingResult[] = [];

  for (const recording of recordings) {
    if (!selected.has(recording.signature)) {
      results.push({
        status: 'skipped',
        recording,
        reason: 'not-selected',
        detail: describeWhyNotSelected(context, recording),
      });
      continue;
    }
    results.push(await processRecording(context, recording));
  }

  return summarize(results);
}

function selectTargets(
  context: PipelineContext,
  candidates: readonly Recording[],
  options: RunOptions,
): Promise<readonly Recording[]> {
  if (options.selectAll === true) {
    return Promise.resolve(candidates);
  }
  if (options.pick !== undefined && options.pick !== '') {
    return Promise.resolve(matchByName(candidates, options.pick));
  }
  return chooseRecordings(context.runner, candidates);
}

function describeWhyNotSelected(context: PipelineContext, recording: Recording): string {
  if (!isPipelineEligible(recording.kind)) {
    return `${recording.kind} は対象外`;
  }
  if (context.processed.has(recording.signature)) {
    return '取り込み済み';
  }
  return '選ばれなかった';
}
