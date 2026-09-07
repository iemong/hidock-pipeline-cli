import { describe, expect, it } from 'vitest';

import type { Recording } from '../../src/device/types.ts';
import { chooseRecordings, describeChoice, estimateUsd } from '../../src/ui/select.ts';
import { fakeRunner } from '../support/fake-runner.ts';

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    name: '2026Jul27-205947-Rec13.hda',
    sizeBytes: 28_137_900,
    recordedAt: new Date(2026, 6, 27, 20, 59, 47),
    kind: 'meeting',
    signature: 'sig-13',
    ...overrides,
  };
}

describe('describeChoice', () => {
  it('日時・長さ・費用・番号を1行にまとめる', () => {
    // 実機 Rec13: 26.8MB = 約39分、実測コスト $0.139
    expect(describeChoice(recording())).toBe('07/27 20:59  39m  $0.09  Rec13');
  });

  it('短い録音も読める形にする', () => {
    const line = describeChoice(recording({ sizeBytes: 600_000 }));
    expect(line).toContain('50s');
  });
});

describe('estimateUsd', () => {
  it('実測に近い額を見積もる', () => {
    // 39分の実測は $0.139（出力トークン込み）。入力分の見積もりはやや低く出る
    expect(estimateUsd(28_137_900)).toBeCloseTo(0.088, 2);
  });
});

describe('chooseRecordings', () => {
  it('候補が無ければダイアログを出さない', async () => {
    const runner = fakeRunner();
    await expect(chooseRecordings(runner, [])).resolves.toEqual([]);
    expect(runner.calls).toHaveLength(0);
  });

  it('選ばれた行から Recording を復元する', async () => {
    const target = recording();
    const runner = fakeRunner({
      osascript: { stdout: `${describeChoice(target)}\n`, stderr: '' },
    });

    const chosen = await chooseRecordings(runner, [target]);
    expect(chosen).toEqual([target]);
  });

  it('複数選択を扱える', async () => {
    const a = recording({ signature: 'a' });
    const b = recording({
      signature: 'b',
      name: '2026Jul22-130112-Rec11.hda',
      recordedAt: new Date(2026, 6, 22, 13, 1, 12),
    });
    const runner = fakeRunner({
      osascript: {
        stdout: `${describeChoice(a)}\n${describeChoice(b)}`,
        stderr: '',
      },
    });

    await expect(chooseRecordings(runner, [a, b])).resolves.toHaveLength(2);
  });

  it('キャンセルは空として扱う（失敗にしない）', async () => {
    const runner = fakeRunner({ osascript: { stdout: '', stderr: '' } });

    await expect(chooseRecordings(runner, [recording()])).resolves.toEqual([]);
  });

  it('複数選択を許可したダイアログを出す', async () => {
    const runner = fakeRunner({ osascript: { stdout: '', stderr: '' } });
    await chooseRecordings(runner, [recording()]);

    const script = runner.calls[0]?.args[1] ?? '';
    expect(script).toContain('choose from list');
    expect(script).toContain('multiple selections allowed');
    expect(script).toContain('1 available');
  });

  it('見覚えのない行は無視する', async () => {
    const runner = fakeRunner({ osascript: { stdout: '知らない行', stderr: '' } });

    await expect(chooseRecordings(runner, [recording()])).resolves.toEqual([]);
  });
});
