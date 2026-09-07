import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RecorderDevice, Recording } from '../../src/device/types.ts';
import { loadConfig } from '../../src/gemini/config.ts';
import type { PipelineContext } from '../../src/pipeline/context.ts';
import { collectStatus, formatStatus } from '../../src/pipeline/status.ts';
import { loadProcessedStore } from '../../src/state/processed.ts';
import { fakeRunner } from '../support/fake-runner.ts';

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    name: '2026Jul28-113023-Rec14.hda',
    sizeBytes: 20_900_000,
    recordedAt: new Date(2026, 6, 28, 11, 30, 23),
    kind: 'meeting',
    signature: 'sig-14',
    ...overrides,
  };
}

async function makeContext(recordings: readonly Recording[]): Promise<PipelineContext> {
  const root = await mkdtemp(join(tmpdir(), 'hidock-status-'));
  const paths = {
    inbox: join(root, 'inbox'),
    noteDir: join(root, 'notes'),
    stateFile: join(root, 'inbox', '.processed', 'index.json'),
  };
  const device: RecorderDevice = {
    listRecordings: () => Promise.resolve(recordings),
    downloadRecording: () => Promise.reject(new Error('使わない')),
  };

  return {
    device,
    runner: fakeRunner(),
    gemini: { fetch: globalThis.fetch, token: () => Promise.resolve('t') },
    config: loadConfig({ GCP_PROJECT: 'test-project' }),
    processed: await loadProcessedStore(paths.stateFile),
    paths,
  };
}

describe('collectStatus', () => {
  it('未取り込みの会議だけを数える', async () => {
    const context = await makeContext([
      recording(),
      recording({ signature: 'w', kind: 'whisper' }),
      recording({ signature: 'u', kind: 'unknown' }),
    ]);

    const report = await collectStatus(context);

    expect(report.pending).toHaveLength(1);
    expect(report.totalCount).toBe(3);
    expect(report.meetingCount).toBe(1);
    expect(report.whisperCount).toBe(1);
  });

  it('取り込み済みは未取り込みに数えない', async () => {
    const target = recording();
    const context = await makeContext([target]);
    await context.processed.add({
      signature: target.signature,
      name: target.name,
      processedAt: '2026-08-01T00:00:00Z',
    });

    const report = await collectStatus(context);

    expect(report.pending).toHaveLength(0);
    expect(report.processedCount).toBe(1);
  });

  it('未取り込み分の費用を見積もる', async () => {
    const report = await collectStatus(await makeContext([recording()]));
    expect(report.estimatedUsd).toBeGreaterThan(0);
  });

  it('デバイスに何も無ければ全て 0', async () => {
    const report = await collectStatus(await makeContext([]));
    expect(report).toMatchObject({ totalCount: 0, meetingCount: 0, estimatedUsd: 0 });
  });

  it('取り込みは行わない（ダウンロードを呼ばない）', async () => {
    // downloadRecording は必ず reject する実装にしてあるので、
    // 呼ばれていればこのテストが落ちる
    await expect(collectStatus(await makeContext([recording()]))).resolves.toBeDefined();
  });
});

describe('formatStatus', () => {
  it('未取り込みがあれば一覧と合計を出す', async () => {
    const text = formatStatus(await collectStatus(await makeContext([recording()])));

    expect(text).toContain('1 pending');
    expect(text).toContain('Rec14');
    expect(text).toContain('29m');
  });

  it('取り込み方を案内する', async () => {
    const text = formatStatus(await collectStatus(await makeContext([recording()])));
    expect(text).toContain('Import Meeting');
  });

  it('何も無ければその旨だけ返す', async () => {
    const text = formatStatus(await collectStatus(await makeContext([])));

    expect(text).toContain('No pending recordings.');
    expect(text).not.toContain('Import Meeting');
  });

  it('デバイスの内訳を添える', async () => {
    const context = await makeContext([
      recording(),
      recording({ signature: 'w', kind: 'whisper' }),
    ]);
    const text = formatStatus(await collectStatus(context));

    expect(text).toContain('2 on device');
    expect(text).toContain('whisper');
  });
});
