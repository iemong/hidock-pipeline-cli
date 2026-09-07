import { describe, expect, it } from 'vitest';

import { formatDuration, probeDurationSeconds } from '../../src/audio/probe.ts';
import { fakeRunner } from '../support/fake-runner.ts';

describe('probeDurationSeconds', () => {
  it('ffprobe の出力を秒として読む', async () => {
    const runner = fakeRunner({ ffprobe: { stdout: '2344.83\n', stderr: '' } });

    await expect(probeDurationSeconds(runner, '/tmp/a.hda')).resolves.toBeCloseTo(
      2344.83,
    );
  });

  it('ffprobe に正しい引数を渡す', async () => {
    const runner = fakeRunner({ ffprobe: { stdout: '10', stderr: '' } });
    await probeDurationSeconds(runner, '/tmp/a.hda');

    expect(runner.calls[0]?.command).toBe('ffprobe');
    expect(runner.calls[0]?.args).toContain('format=duration');
    expect(runner.calls[0]?.args.at(-1)).toBe('/tmp/a.hda');
  });

  it.each(['', 'N/A', '0', '-1'])(
    '数値にならない出力 %s は失敗させる',
    async (stdout) => {
      const runner = fakeRunner({ ffprobe: { stdout, stderr: '' } });

      await expect(probeDurationSeconds(runner, '/tmp/a.hda')).rejects.toThrow(
        'Could not determine audio duration',
      );
    },
  );

  it('デバイス報告値ではなく実測を使うことを保証する', async () => {
    // 実機 Rec01: デバイスは 16.132秒 と報告するが実際は 4.03秒
    const runner = fakeRunner({ ffprobe: { stdout: '4.03', stderr: '' } });

    await expect(probeDurationSeconds(runner, '/tmp/rec01.hda')).resolves.toBeCloseTo(
      4.03,
    );
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45s'],
    [90, '1m'],
    [2344, '39m'],
    [3600, '1h 0m'],
    [4500, '1h 15m'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
