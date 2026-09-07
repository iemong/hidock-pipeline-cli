import { describe, expect, it } from 'vitest';

import type { Recording } from '../../src/device/types.ts';
import {
  describeSummary,
  type ProcessedResult,
  type RecordingResult,
  summarize,
} from '../../src/pipeline/types.ts';

const RECORDING: Recording = {
  name: '2026Jul13-103142-Rec03.hda',
  sizeBytes: 100,
  recordedAt: new Date(2026, 6, 13),
  kind: 'meeting',
  signature: 'sig',
};

function processed(costUsd: number): ProcessedResult {
  return {
    status: 'processed',
    recording: RECORDING,
    notePath: '/notes/a.md',
    durationSeconds: 100,
    costUsd,
    attempts: 1,
  };
}

const skipped: RecordingResult = {
  status: 'skipped',
  recording: RECORDING,
  reason: 'not-meeting',
  detail: 'whisper',
};

describe('summarize', () => {
  it('処理済みだけを抽出する', () => {
    const summary = summarize([processed(0.1), skipped]);
    expect(summary.processed).toHaveLength(1);
    expect(summary.results).toHaveLength(2);
  });

  it('コストを合計する', () => {
    const summary = summarize([processed(0.1), processed(0.2)]);
    expect(summary.totalCostUsd).toBeCloseTo(0.3);
  });

  it('空なら合計は 0', () => {
    expect(summarize([]).totalCostUsd).toBe(0);
  });
});

describe('describeSummary', () => {
  it('何も無ければその旨を返す', () => {
    expect(describeSummary(summarize([]))).toBe('No new recordings.');
  });

  it('全て対象外なら件数を添える', () => {
    expect(describeSummary(summarize([skipped]))).toContain('1 skipped');
  });

  it('作成件数とコストを返す', () => {
    const message = describeSummary(summarize([processed(0.088), processed(0.1)]));
    expect(message).toContain('Created 2 meeting note(s)');
    expect(message).toContain('$0.188');
  });
});
