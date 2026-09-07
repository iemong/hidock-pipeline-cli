import { describe, expect, it } from 'vitest';

import {
  classifyRecording,
  explainExclusion,
  isPipelineEligible,
  type ParsedRecording,
  parseRecording,
  type RecordingKind,
} from '../src/classify.ts';

// 実機（HiDock P1）から取得した実際のファイル名
const REAL_MEETING = '2026Jul13-103142-Rec03.hda';
const REAL_WHISPER = '2026Jul13-200404-Wip01.hda';

/** パースできる前提のケースで使う。失敗したらテストを落とす。 */
function parsedOrFail(fileName: string): ParsedRecording {
  const parsed = parseRecording(fileName);
  if (parsed === null) {
    throw new Error(`パースに失敗した: ${fileName}`);
  }
  return parsed;
}

describe('classifyRecording', () => {
  it.each([
    ['2026Jul12-164419-Rec01.hda', 'meeting'],
    ['2026Jul13-205959-Rec04.hda', 'meeting'],
    [REAL_MEETING, 'meeting'],
    ['2026Jul12-194413-Wip00.hda', 'whisper'],
    [REAL_WHISPER, 'whisper'],
  ])('%s を %s と判定する', (fileName, expected) => {
    expect(classifyRecording(fileName)).toBe(expected);
  });

  it('モードの大文字小文字を区別しない', () => {
    expect(classifyRecording('2026Jul13-103142-REC03.hda')).toBe('meeting');
    expect(classifyRecording('2026Jul13-103142-rec03.hda')).toBe('meeting');
  });

  it('前後の空白を無視する', () => {
    expect(classifyRecording(`  ${REAL_MEETING}  `)).toBe('meeting');
  });

  it.each([
    ['', '空文字'],
    ['REC001.hda', '日時部が無い'],
    ['2026Jul13-103142-Rec03.mp3', '拡張子が違う'],
    ['2026Jul13-103142-Rec.hda', '連番が無い'],
    ['2026Xxx13-103142-Rec03.hda', '月名が不正'],
    ['2026Jul13-103142-Zzz03.hda', '未知のモード'],
  ])('%s は unknown（%s）', (fileName) => {
    expect(classifyRecording(fileName)).toBe('unknown');
  });
});

describe('parseRecording', () => {
  it('録音日時と連番を取り出す', () => {
    const parsed = parsedOrFail(REAL_MEETING);
    expect(parsed.kind).toBe('meeting');
    expect(parsed.sequence).toBe(3);
    // 2026-07-13 10:31:42 ローカル時刻
    expect(parsed.recordedAt.getFullYear()).toBe(2026);
    expect(parsed.recordedAt.getMonth()).toBe(6);
    expect(parsed.recordedAt.getDate()).toBe(13);
    expect(parsed.recordedAt.getHours()).toBe(10);
    expect(parsed.recordedAt.getMinutes()).toBe(31);
    expect(parsed.recordedAt.getSeconds()).toBe(42);
  });

  it('Wip も日時を取り出せる', () => {
    const parsed = parsedOrFail(REAL_WHISPER);
    expect(parsed.kind).toBe('whisper');
    expect(parsed.sequence).toBe(1);
    expect(parsed.recordedAt.getHours()).toBe(20);
  });

  it('未知のモードでも日時は取れるが kind は unknown', () => {
    const parsed = parsedOrFail('2026Jul13-103142-Zzz03.hda');
    expect(parsed.kind).toBe('unknown');
    expect(parsed.recordedAt.getDate()).toBe(13);
  });

  it('形式に合わなければ null', () => {
    expect(parseRecording('REC001.hda')).toBeNull();
    expect(parseRecording('2026Xxx13-103142-Rec03.hda')).toBeNull();
  });

  it('全ての月名を解釈できる', () => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    months.forEach((mon, index) => {
      expect(parsedOrFail(`2026${mon}15-120000-Rec01.hda`).recordedAt.getMonth()).toBe(
        index,
      );
    });
  });
});

describe('isPipelineEligible', () => {
  it('会議のみを対象にする', () => {
    expect(isPipelineEligible('meeting')).toBe(true);
  });

  it.each<RecordingKind>(['whisper', 'unknown'])('%s は対象外', (kind) => {
    expect(isPipelineEligible(kind)).toBe(false);
  });
});

describe('explainExclusion', () => {
  it('会議は除外理由を持たない', () => {
    expect(explainExclusion('meeting')).toBeNull();
  });

  it.each<RecordingKind>(['whisper', 'unknown'])('%s は理由を返す', (kind) => {
    const reason = explainExclusion(kind);
    expect(reason).not.toBeNull();
    expect(reason).not.toBe('');
  });
});

describe('分類とパイプライン可否の一貫性', () => {
  it('パイプライン対象なら除外理由は無く、対象外なら必ず理由がある', () => {
    const kinds: RecordingKind[] = ['meeting', 'whisper', 'unknown'];

    for (const kind of kinds) {
      expect(isPipelineEligible(kind)).toBe(explainExclusion(kind) === null);
    }
  });
});
