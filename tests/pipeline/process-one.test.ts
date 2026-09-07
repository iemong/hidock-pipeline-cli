import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RecorderDevice, Recording } from '../../src/device/types.ts';
import { loadConfig } from '../../src/gemini/config.ts';
import type { PipelineContext } from '../../src/pipeline/context.ts';
import { processRecording } from '../../src/pipeline/process-one.ts';
import { loadProcessedStore } from '../../src/state/processed.ts';
import { fakeRunner } from '../support/fake-runner.ts';

const MEETING: Recording = {
  name: '2026Jul13-103142-Rec03.hda',
  sizeBytes: 8_816_844,
  recordedAt: new Date(2026, 6, 13, 10, 31, 42),
  kind: 'meeting',
  signature: 'sig-meeting',
};

const WHISPER: Recording = { ...MEETING, kind: 'whisper', signature: 'sig-whisper' };

function stubDevice(audio = new Uint8Array([1, 2, 3])): RecorderDevice {
  return {
    listRecordings: () => Promise.resolve([MEETING]),
    downloadRecording: () => Promise.resolve(audio),
  };
}

function geminiReturning(text: string, finishReason = 'STOP') {
  return {
    fetch: (() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text }] }, finishReason }],
            usageMetadata: {
              promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 58_621 }],
              candidatesTokenCount: 100,
            },
          }),
      } as Response)) as typeof globalThis.fetch,
    token: () => Promise.resolve('token'),
  };
}

async function makeContext(
  overrides: Partial<PipelineContext> = {},
): Promise<PipelineContext> {
  const root = await mkdtemp(join(tmpdir(), 'hidock-pipe-'));
  const paths = {
    inbox: join(root, 'inbox'),
    noteDir: join(root, 'notes'),
    stateFile: join(root, 'inbox', '.processed', 'index.json'),
  };

  return {
    device: stubDevice(),
    runner: fakeRunner({ ffprobe: { stdout: '2344.83', stderr: '' } }),
    gemini: geminiReturning('### 1. 決定事項\n- 決めた'),
    config: loadConfig({}),
    processed: await loadProcessedStore(paths.stateFile),
    paths,
    ...overrides,
  };
}

describe('processRecording', () => {
  it('会議を処理してノートを書く', async () => {
    const context = await makeContext();
    const result = await processRecording(context, MEETING);

    expect(result.status).toBe('processed');
    if (result.status !== 'processed') {
      return;
    }
    const note = await readFile(result.notePath, 'utf8');
    expect(note).toContain('### 1. 決定事項');
    expect(note).toContain('signature: sig-meeting');
    expect(result.notePath.endsWith('2026-07-13-1031-Rec03.md')).toBe(true);
  });

  it('会議以外は処理しない', async () => {
    const context = await makeContext();
    const result = await processRecording(context, WHISPER);

    expect(result).toMatchObject({ status: 'skipped', reason: 'not-meeting' });
  });

  it('取り込み済みは二度処理しない（同じノートを何通も作らない）', async () => {
    const context = await makeContext();
    await processRecording(context, MEETING);
    const second = await processRecording(context, MEETING);

    expect(second).toMatchObject({ status: 'skipped', reason: 'already-processed' });
  });

  it('短すぎる録音は会議とみなさない', async () => {
    const context = await makeContext({
      runner: fakeRunner({ ffprobe: { stdout: '30', stderr: '' } }),
    });

    const result = await processRecording(context, MEETING);
    expect(result).toMatchObject({ status: 'skipped', reason: 'too-short' });
  });

  it('取得に失敗しても例外にせず結果として返す', async () => {
    const context = await makeContext({
      device: {
        listRecordings: () => Promise.resolve([]),
        downloadRecording: () => Promise.reject(new Error('USB エラー')),
      },
    });

    const result = await processRecording(context, MEETING);
    expect(result).toMatchObject({ status: 'skipped', reason: 'download-failed' });
  });

  it('デバイス報告ではなく ffprobe の長さを記録する', async () => {
    const context = await makeContext();
    const result = await processRecording(context, MEETING);

    if (result.status !== 'processed') {
      throw new Error('processed でない');
    }
    expect(Math.round(result.durationSeconds)).toBe(2345);
    const note = await readFile(result.notePath, 'utf8');
    expect(note).toContain('duration_min: 39');
  });

  it('音声を GCS に上げてから生成する', async () => {
    const runner = fakeRunner({ ffprobe: { stdout: '2344', stderr: '' } });
    const context = await makeContext({ runner });
    await processRecording(context, MEETING);

    const upload = runner.calls.find((c) => c.args.includes('cp'));
    expect(upload?.command).toBe('gcloud');
    expect(upload?.args.some((a) => a.endsWith('Rec03.mp3'))).toBe(true);
  });

  it('コストを算出してノートに残す', async () => {
    const context = await makeContext();
    const result = await processRecording(context, MEETING);

    if (result.status !== 'processed') {
      throw new Error('processed でない');
    }
    expect(result.costUsd).toBeGreaterThan(0);
    expect(await readFile(result.notePath, 'utf8')).toContain('cost_usd:');
  });
});
