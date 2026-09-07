import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseDeviceListing } from '../../src/device/listing.ts';

/** 実機から取得した本物の応答 */
const REAL_LISTING: unknown = JSON.parse(
  readFileSync(new URL('../../fixtures/device-listing.json', import.meta.url), 'utf8'),
);

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: '2026Jul13-103142-Rec03.hda',
    length: 8_816_844,
    signature: 'abc123',
    ...overrides,
  };
}

describe('parseDeviceListing（実機の応答）', () => {
  it('16件すべてを解析でき、取りこぼしが無い', () => {
    const result = parseDeviceListing(REAL_LISTING);
    expect(result.recordings).toHaveLength(16);
    expect(result.skipped).toEqual([]);
  });

  it('会議（Rec）と Wip を正しく振り分ける', () => {
    const { recordings } = parseDeviceListing(REAL_LISTING);
    const meetings = recordings.filter((r) => r.kind === 'meeting');
    const whispers = recordings.filter((r) => r.kind === 'whisper');

    expect(meetings.length).toBeGreaterThan(0);
    expect(whispers.length).toBeGreaterThan(0);
    expect(meetings.length + whispers.length).toBe(16);
  });

  it('デバイス報告の duration は保持しない（4倍ずれるため）', () => {
    const { recordings } = parseDeviceListing(REAL_LISTING);
    expect(recordings[0]).not.toHaveProperty('duration');
  });

  it('冪等性キーになる signature を保持する', () => {
    const { recordings } = parseDeviceListing(REAL_LISTING);
    const signatures = new Set(recordings.map((r) => r.signature));
    expect(signatures.size).toBe(16);
  });
});

describe('parseDeviceListing（形式）', () => {
  it('配列を直接渡しても受け付ける', () => {
    const result = parseDeviceListing([entry()]);
    expect(result.recordings).toHaveLength(1);
  });

  it('files を持つオブジェクトを受け付ける', () => {
    const result = parseDeviceListing({ files: [entry()] });
    expect(result.recordings).toHaveLength(1);
  });

  it.each([null, '文字列', { notFiles: [] }])(
    '%s は解析できず理由を残す',
    (raw: unknown) => {
      const result = parseDeviceListing(raw);
      expect(result.recordings).toEqual([]);
      expect(result.skipped).toHaveLength(1);
    },
  );
});

describe('parseDeviceListing（不正な要素）', () => {
  it.each([
    entry({ name: undefined }),
    entry({ length: 0 }),
    entry({ length: 'x' }),
    entry({ signature: undefined }),
    entry({ name: 'REC001.hda' }),
    '要素が文字列',
  ])('不正な要素 %# はスキップして理由を残す', (bad: unknown) => {
    const result = parseDeviceListing([bad]);
    expect(result.recordings).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).not.toBe('');
  });

  it('不正な要素があっても正常な要素は取り出せる', () => {
    const result = parseDeviceListing([entry(), 'ゴミ', entry({ name: 'bad.hda' })]);
    expect(result.recordings).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
  });
});
