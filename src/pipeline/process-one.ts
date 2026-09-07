import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { probeDurationSeconds } from '../audio/probe.ts';
import { isPipelineEligible } from '../classify.ts';
import type { Recording } from '../device/types.ts';
import { uploadAudio } from '../gcs/upload.ts';
import { generate } from '../gemini/client.ts';
import { buildMeetingPrompt } from '../gemini/prompt.ts';
import { estimateCostUsd } from '../gemini/response.ts';
import { buildNote, noteFileName } from '../vault/note.ts';

import type { PipelineContext } from './context.ts';
import type { RecordingResult, SkipReason } from './types.ts';

/** これより短い録音は会議ではないとみなす（誤操作の録音を弾く） */
const MIN_DURATION_SECONDS = 60;
const HDA_EXTENSION = /\.hda$/i;

function skip(recording: Recording, reason: SkipReason, detail: string): RecordingResult {
  return { status: 'skipped', recording, reason, detail };
}

async function saveAudio(
  context: PipelineContext,
  recording: Recording,
): Promise<string> {
  const bytes = await context.device.downloadRecording(recording);
  await mkdir(context.paths.inbox, { recursive: true });
  const localPath = join(context.paths.inbox, recording.name);
  await writeFile(localPath, bytes);
  return localPath;
}

/**
 * 録音1件を処理する。
 *
 * 途中で失敗しても例外を投げず結果として返す。1件の失敗で残りが
 * 止まると、繋ぎ直すという人間の操作が必要になってしまうため。
 */
export async function processRecording(
  context: PipelineContext,
  recording: Recording,
): Promise<RecordingResult> {
  if (!isPipelineEligible(recording.kind)) {
    return skip(recording, 'not-meeting', `${recording.kind} は対象外`);
  }
  if (context.processed.has(recording.signature)) {
    return skip(recording, 'already-processed', '取り込み済み');
  }

  let localPath: string;
  try {
    localPath = await saveAudio(context, recording);
  } catch (cause) {
    return skip(recording, 'download-failed', String(cause));
  }

  const durationSeconds = await probeDurationSeconds(context.runner, localPath);
  if (durationSeconds < MIN_DURATION_SECONDS) {
    return skip(recording, 'too-short', `${Math.round(durationSeconds)}秒`);
  }

  const fileUri = await uploadAudio(context.runner, {
    localPath,
    bucket: context.config.bucket,
    objectName: recording.name.replace(HDA_EXTENSION, '.mp3'),
    project: context.config.project,
  });

  const result = await generate(context.gemini, context.config, {
    fileUri,
    mimeType: 'audio/mpeg',
    prompt: buildMeetingPrompt({
      recordedAt: recording.recordedAt,
      vocabulary: context.vocabulary,
    }),
  });

  const costUsd = estimateCostUsd(result.usage);
  const note = buildNote({
    recording,
    durationSeconds,
    body: result.text,
    model: context.config.model,
    costUsd,
    attempts: result.attempts,
  });

  await mkdir(context.paths.noteDir, { recursive: true });
  const notePath = join(context.paths.noteDir, noteFileName(recording));
  await writeFile(notePath, note, 'utf8');

  await context.processed.add({
    signature: recording.signature,
    name: recording.name,
    processedAt: new Date().toISOString(),
  });

  return {
    status: 'processed',
    recording,
    notePath,
    durationSeconds,
    costUsd,
    attempts: result.attempts,
  };
}
