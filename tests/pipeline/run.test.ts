import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RecorderDevice, Recording } from '../../src/device/types.ts';
import { loadConfig } from '../../src/gemini/config.ts';
import type { PipelineContext } from '../../src/pipeline/context.ts';
import { runPipeline } from '../../src/pipeline/run.ts';
import { loadProcessedStore } from '../../src/state/processed.ts';
import { describeChoice } from '../../src/ui/select.ts';
import { fakeRunner } from '../support/fake-runner.ts';

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    name: '2026Jul13-103142-Rec03.hda',
    sizeBytes: 8_816_844,
    recordedAt: new Date(2026, 6, 13, 10, 31, 42),
    kind: 'meeting',
    signature: 'sig-1',
    ...overrides,
  };
}

function device(recordings: readonly Recording[]): RecorderDevice {
  return {
    listRecordings: () => Promise.resolve(recordings),
    downloadRecording: () => Promise.resolve(new Uint8Array([1, 2, 3])),
  };
}

const gemini = {
  fetch: (() =>
    Promise.resolve({
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: '本文' }] }, finishReason: 'STOP' }],
          usageMetadata: {
            promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 58_621 }],
            candidatesTokenCount: 100,
          },
        }),
    } as Response)) as typeof globalThis.fetch,
  token: () => Promise.resolve('token'),
};

async function makeContext(recordings: readonly Recording[]): Promise<PipelineContext> {
  const root = await mkdtemp(join(tmpdir(), 'hidock-run-'));
  const paths = {
    inbox: join(root, 'inbox'),
    noteDir: join(root, 'notes'),
    stateFile: join(root, 'inbox', '.processed', 'index.json'),
  };

  return {
    device: device(recordings),
    runner: fakeRunner({ ffprobe: { stdout: '2344.83', stderr: '' } }),
    gemini,
    config: loadConfig({ GCP_PROJECT: 'test-project' }),
    processed: await loadProcessedStore(paths.stateFile),
    paths,
  };
}

describe('runPipeline', () => {
  it('会議だけを処理し、それ以外は結果に理由を残す', async () => {
    const context = await makeContext([
      recording(),
      recording({ signature: 'sig-2', kind: 'whisper' }),
      recording({ signature: 'sig-3', kind: 'unknown' }),
    ]);

    const summary = await runPipeline(context, { selectAll: true });

    expect(summary.results).toHaveLength(3);
    expect(summary.processed).toHaveLength(1);
  });

  it('複数の会議をすべて処理する', async () => {
    const context = await makeContext([
      recording({ signature: 'a' }),
      recording({
        signature: 'b',
        name: '2026Jul14-120022-Rec06.hda',
        recordedAt: new Date(2026, 6, 14, 12, 0, 22),
      }),
    ]);

    const summary = await runPipeline(context, { selectAll: true });

    expect(summary.processed).toHaveLength(2);
    expect(await readdir(context.paths.noteDir)).toHaveLength(2);
  });

  it('コストを合計する', async () => {
    const context = await makeContext([recording()]);
    const summary = await runPipeline(context, { selectAll: true });

    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });

  it('録音が無ければ何も処理しない', async () => {
    const summary = await runPipeline(await makeContext([]), { selectAll: true });

    expect(summary.results).toEqual([]);
    expect(summary.totalCostUsd).toBe(0);
  });

  it('二度走らせても同じノートを作り直さない', async () => {
    const context = await makeContext([recording()]);

    await runPipeline(context, { selectAll: true });
    const second = await runPipeline(context, { selectAll: true });

    expect(second.processed).toHaveLength(0);
    expect(await readdir(context.paths.noteDir)).toHaveLength(1);
  });
});

describe('選択方式', () => {
  it('既定では選ばれたものだけ処理する', async () => {
    const target = recording();
    // 実機では連番が入るので、表示が衝突しない別の録音にする
    const other = recording({
      signature: 'other',
      name: '2026Jul22-130112-Rec11.hda',
      recordedAt: new Date(2026, 6, 22, 13, 1, 12),
    });
    const context = await makeContext([target, other]);
    const runner = fakeRunner({
      ffprobe: { stdout: '2344.83', stderr: '' },
      osascript: { stdout: describeChoice(target), stderr: '' },
    });

    const summary = await runPipeline({ ...context, runner });

    expect(summary.processed).toHaveLength(1);
    expect(summary.processed[0]?.recording.signature).toBe(target.signature);
  });

  it('何も選ばなければ何も処理しない', async () => {
    const context = await makeContext([recording()]);
    const runner = fakeRunner({
      ffprobe: { stdout: '2344.83', stderr: '' },
      osascript: { stdout: '', stderr: '' },
    });

    const summary = await runPipeline({ ...context, runner });

    expect(summary.processed).toHaveLength(0);
    expect(summary.results[0]).toMatchObject({ reason: 'not-selected' });
  });

  it('取り込み済みは選択肢に出さない', async () => {
    const target = recording();
    const context = await makeContext([target]);
    await context.processed.add({
      signature: target.signature,
      name: target.name,
      processedAt: '2026-07-28T00:00:00Z',
    });
    const runner = fakeRunner({ osascript: { stdout: '', stderr: '' } });

    await runPipeline({ ...context, runner });

    // 候補が無いのでダイアログ自体を出さない
    expect(runner.calls).toHaveLength(0);
  });

  it('会議以外は選択肢に出さない', async () => {
    const context = await makeContext([recording({ kind: 'whisper' })]);
    const runner = fakeRunner({ osascript: { stdout: '', stderr: '' } });

    await runPipeline({ ...context, runner });

    expect(runner.calls).toHaveLength(0);
  });
});

describe('名前で指定する（Raycast の引数）', () => {
  it('名前に含まれる文字列で選べる', async () => {
    const target = recording({
      signature: 'sig-14',
      name: '2026Jul28-113023-Rec14.hda',
      recordedAt: new Date(2026, 6, 28, 11, 30, 23),
    });
    const context = await makeContext([target, recording({ signature: 'other' })]);

    const summary = await runPipeline(context, { pick: 'Rec14' });

    expect(summary.processed).toHaveLength(1);
    expect(summary.processed[0]?.recording.signature).toBe('sig-14');
  });

  it('大文字小文字を区別しない', async () => {
    const context = await makeContext([recording()]);
    const summary = await runPipeline(context, { pick: 'rec03' });

    expect(summary.processed).toHaveLength(1);
  });

  it('指定してもダイアログは出さない', async () => {
    const context = await makeContext([recording()]);
    const runner = fakeRunner({ ffprobe: { stdout: '2344.83', stderr: '' } });

    await runPipeline({ ...context, runner }, { pick: 'Rec03' });

    expect(runner.calls.some((c) => c.command === 'osascript')).toBe(false);
  });

  it('該当が無ければ候補を添えて失敗させる', async () => {
    const context = await makeContext([recording()]);

    await expect(runPipeline(context, { pick: 'Rec99' })).rejects.toThrow('Rec99');
  });
});
