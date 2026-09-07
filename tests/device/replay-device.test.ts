import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createReplayDevice } from '../../src/device/replay-device.ts';
import type { Recording } from '../../src/device/types.ts';

const REAL_LISTING: unknown = JSON.parse(
  readFileSync(new URL('../../fixtures/device-listing.json', import.meta.url), 'utf8'),
);

const SAMPLE = '2026Jul13-103142-Rec03.hda';

/** 一覧から実物の Recording を取り出す */
async function sampleRecording(device: {
  listRecordings: () => Promise<readonly Recording[]>;
}) {
  const found = (await device.listRecordings()).find((r) => r.name === SAMPLE);
  if (found === undefined) {
    throw new Error('fixtures に対象が無い');
  }
  return found;
}

describe('createReplayDevice', () => {
  it('実機の応答から一覧を再生できる', async () => {
    const device = createReplayDevice(REAL_LISTING);
    const recordings = await device.listRecordings();

    expect(recordings).toHaveLength(16);
    expect(recordings.some((r) => r.name === SAMPLE)).toBe(true);
  });

  it('用意した音声を返す', async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const device = createReplayDevice(REAL_LISTING, new Map([[SAMPLE, audio]]));

    await expect(
      device.downloadRecording(await sampleRecording(device)),
    ).resolves.toEqual(audio);
  });

  it('音声が用意されていなければ失敗する（黙って空を返さない）', async () => {
    const device = createReplayDevice(REAL_LISTING);
    await expect(device.downloadRecording(await sampleRecording(device))).rejects.toThrow(
      SAMPLE,
    );
  });

  it('解析できない応答なら空の一覧になる', async () => {
    const device = createReplayDevice(null);
    await expect(device.listRecordings()).resolves.toEqual([]);
  });

  it('delete や format は存在しない（呼ぶ手段を与えない）', () => {
    const device = createReplayDevice(REAL_LISTING);
    expect(Object.keys(device).sort()).toEqual(['downloadRecording', 'listRecordings']);
  });
});
