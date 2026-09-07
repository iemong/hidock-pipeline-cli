import type { Recording } from '../device/types.ts';

const HDA_EXTENSION = /\.hda$/i;

/**
 * Builds the Obsidian note for one recording.
 *
 * This is an AI-generated interpretation, not a verified transcript —
 * the note says so explicitly rather than implying it's a factual log.
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
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Assembles the note body, stating up front that it's an AI draft,
 * not a confirmed record — treating it as authoritative would be wrong.
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
    `# Meeting Notes ${formatDateKey(at)} ${formatTime(at)}`,
    '',
    '> AI-generated **draft** from audio — not a verified record.',
    `> Recording ${formatDurationLabel(durationSeconds)} / ${model} / $${costUsd.toFixed(4)}`,
  ].join('\n');

  return `${frontmatter}\n\n${header}\n\n${body.trim()}\n`;
}
