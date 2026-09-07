import { parseRecording } from '../classify.ts';

import type { ListingParseResult, Recording } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readSize(source: Record<string, unknown>): number | null {
  const value = source['length'];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 一覧の1要素を Recording に変換する。
 * 変換できない場合はスキップ理由の文字列を返す。
 */
function toRecording(entry: unknown): Recording | string {
  if (!isRecord(entry)) {
    return 'entry is not an object';
  }

  const name = readString(entry, 'name');
  if (name === null) {
    return 'missing name';
  }

  const sizeBytes = readSize(entry);
  if (sizeBytes === null) {
    return `${name}: length is not a positive number`;
  }

  const signature = readString(entry, 'signature');
  if (signature === null) {
    return `${name}: missing signature`;
  }

  const parsed = parseRecording(name);
  if (parsed === null) {
    return `${name}: filename doesn't match a known format`;
  }

  return { name, sizeBytes, recordedAt: parsed.recordedAt, kind: parsed.kind, signature };
}

/**
 * デバイスの一覧応答を解析する。
 *
 * 応答は `{ files: [...] }` の形。配列そのものを渡された場合も受け付ける。
 */
export function parseDeviceListing(raw: unknown): ListingParseResult {
  const entries = extractEntries(raw);
  if (entries === null) {
    return {
      recordings: [],
      skipped: ["response is neither an array nor an object with a 'files' property"],
    };
  }

  const recordings: Recording[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const result = toRecording(entry);
    if (typeof result === 'string') {
      skipped.push(result);
    } else {
      recordings.push(result);
    }
  }

  return { recordings, skipped };
}

function extractEntries(raw: unknown): readonly unknown[] | null {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (isRecord(raw) && Array.isArray(raw['files'])) {
    return raw['files'];
  }
  return null;
}
