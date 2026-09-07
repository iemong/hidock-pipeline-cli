import { describe, expect, it } from 'vitest';

import type { Recording } from '../../src/device/types.ts';
import { buildNote, formatDateKey, noteFileName } from '../../src/vault/note.ts';

const RECORDING: Recording = {
  name: '2026Jul13-103142-Rec03.hda',
  sizeBytes: 8_816_844,
  recordedAt: new Date(2026, 6, 13, 10, 31, 42),
  kind: 'meeting',
  signature: 'd52aad03cb9cf53508fed4108864a5a7',
};

const PARAMS = {
  recording: RECORDING,
  durationSeconds: 2344.83,
  body: '### 1. 決定事項\n- 何もない',
  model: 'gemini-3.6-flash',
  costUsd: 0.0881,
  attempts: 1,
};

describe('noteFileName', () => {
  it('日時と録音番号から名前を作る', () => {
    expect(noteFileName(RECORDING)).toBe('2026-07-13-1031-Rec03.md');
  });

  it('Wip でも同じ規則で作れる', () => {
    const wip: Recording = {
      ...RECORDING,
      name: '2026Jul13-200404-Wip01.hda',
      recordedAt: new Date(2026, 6, 13, 20, 4, 4),
    };
    expect(noteFileName(wip)).toBe('2026-07-13-2004-Wip01.md');
  });
});

describe('formatDateKey', () => {
  it('ゼロ埋めする', () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('buildNote', () => {
  it('frontmatter に追跡に必要な情報を入れる', () => {
    const note = buildNote(PARAMS);

    expect(note).toContain('source: 2026Jul13-103142-Rec03.hda');
    expect(note).toContain('signature: d52aad03cb9cf53508fed4108864a5a7');
    expect(note).toContain('model: gemini-3.6-flash');
    expect(note).toContain('cost_usd: 0.0881');
    expect(note).toContain('type: hidock-meeting');
  });

  it('デバイス報告ではなく実測の長さを分で書く', () => {
    expect(buildNote(PARAMS)).toContain('duration_min: 39');
  });

  it('確定ではなく候補であることを明示する', () => {
    expect(buildNote(PARAMS)).toContain('not a verified record');
  });

  it('本文をそのまま含める', () => {
    expect(buildNote(PARAMS)).toContain('### 1. 決定事項');
  });

  it('frontmatter で始まり改行で終わる', () => {
    const note = buildNote(PARAMS);
    expect(note.startsWith('---\n')).toBe(true);
    expect(note.endsWith('\n')).toBe(true);
  });

  it('再試行した場合は回数を残す', () => {
    expect(buildNote({ ...PARAMS, attempts: 3 })).toContain('attempts: 3');
  });
});
