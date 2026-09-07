import type { Recording } from '../device/types.ts';

const HDA_EXTENSION = /\.hda$/i;

/**
 * Obsidian に置くノートの組み立て。
 *
 * Vault 側の原則に従い、これは解釈であって事実ログではない。
 * 置き先は `98-AI-Insights/hidock/` であり、`98-📅 Timestamps/` には触れない。
 */

export interface NoteParams {
  readonly recording: Recording;
  readonly durationSeconds: number;
  readonly body: string;
  readonly model: string;
  readonly costUsd: number;
  readonly attempts: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 例: 2026-07-13-1031-Rec03.md */
export function noteFileName(recording: Recording): string {
  const at = recording.recordedAt;
  const suffix = recording.name.replace(HDA_EXTENSION, '').split('-').pop() ?? 'Rec';
  return `${formatDateKey(at)}-${pad(at.getHours())}${pad(at.getMinutes())}-${suffix}.md`;
}

function formatDurationLabel(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

/**
 * ノート本文を組み立てる。
 *
 * 冒頭に「AI による解釈であり確定ではない」ことを明示する。
 * 断定的な記録として扱われると、Vault 側の原則が崩れるため。
 */
export function buildNote(params: NoteParams): string {
  const { recording, durationSeconds, body, model, costUsd, attempts } = params;
  const at = recording.recordedAt;

  const frontmatter = [
    '---',
    `recorded_at: ${formatDateKey(at)} ${formatTime(at)}`,
    `source: ${recording.name}`,
    `signature: ${recording.signature}`,
    `duration_min: ${Math.round(durationSeconds / 60)}`,
    `model: ${model}`,
    `cost_usd: ${costUsd.toFixed(4)}`,
    `attempts: ${attempts}`,
    'type: hidock-meeting',
    '---',
  ].join('\n');

  const header = [
    `# 会議メモ ${formatDateKey(at)} ${formatTime(at)}`,
    '',
    '> AI が音声から生成した**候補**であり、確定した記録ではない。',
    `> 録音 ${formatDurationLabel(durationSeconds)} / ${model} / $${costUsd.toFixed(4)}`,
  ].join('\n');

  return `${frontmatter}\n\n${header}\n\n${body.trim()}\n`;
}
