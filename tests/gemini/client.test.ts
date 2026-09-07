import { describe, expect, it } from 'vitest';

import {
  type GeminiDeps,
  GenerationIncompleteError,
  generate,
} from '../../src/gemini/client.ts';
import { loadConfig } from '../../src/gemini/config.ts';

const CONFIG = loadConfig({ GCP_PROJECT: 'test-project' });
const GCP_PROJECT_ERROR = /GCP_PROJECT/;

const REQUEST = {
  fileUri: 'gs://bucket/audio/rec.mp3',
  mimeType: 'audio/mpeg',
  prompt: 'テスト',
};

function response(text: string, finishReason: string): Response {
  return {
    json: () =>
      Promise.resolve({
        candidates: [{ content: { parts: [{ text }] }, finishReason }],
        usageMetadata: { candidatesTokenCount: 1 },
      }),
  } as Response;
}

function depsReturning(...reasons: readonly string[]): GeminiDeps & {
  readonly calls: () => number;
  readonly lastBody: () => unknown;
} {
  let index = 0;
  let lastBody: unknown = null;

  return {
    fetch: ((_url: string, init?: RequestInit) => {
      lastBody = JSON.parse(String(init?.body));
      const reason = reasons[Math.min(index, reasons.length - 1)] ?? 'STOP';
      index += 1;
      return Promise.resolve(response('本文', reason));
    }) as typeof globalThis.fetch,
    token: () => Promise.resolve('dummy-token'),
    calls: () => index,
    lastBody: () => lastBody,
  };
}

describe('generate', () => {
  it('STOP なら1回で返す', async () => {
    const deps = depsReturning('STOP');
    const result = await generate(deps, CONFIG, REQUEST);

    expect(result.text).toBe('本文');
    expect(result.attempts).toBe(1);
    expect(deps.calls()).toBe(1);
  });

  it('STOP 以外は作り直す', async () => {
    const deps = depsReturning('MAX_TOKENS', 'STOP');
    const result = await generate(deps, CONFIG, REQUEST);

    expect(result.attempts).toBe(2);
    expect(deps.calls()).toBe(2);
  });

  it('試行上限まで STOP にならなければ失敗させる（壊れた結果を渡さない）', async () => {
    const deps = depsReturning('MAX_TOKENS');

    await expect(generate(deps, CONFIG, REQUEST)).rejects.toBeInstanceOf(
      GenerationIncompleteError,
    );
    expect(deps.calls()).toBe(CONFIG.maxAttempts);
  });

  it('音声は fileData で渡す（inline にしない）', async () => {
    const deps = depsReturning('STOP');
    await generate(deps, CONFIG, REQUEST);

    const body = deps.lastBody() as {
      contents: [{ parts: [{ fileData: { fileUri: string; mimeType: string } }] }];
    };
    expect(body.contents[0].parts[0].fileData).toEqual({
      fileUri: REQUEST.fileUri,
      mimeType: REQUEST.mimeType,
    });
  });

  it('実測で決めた生成設定を送る', async () => {
    const deps = depsReturning('STOP');
    await generate(deps, CONFIG, REQUEST);

    const body = deps.lastBody() as {
      generationConfig: {
        temperature: number;
        thinkingConfig: { thinkingBudget: number };
      };
    };
    expect(body.generationConfig.temperature).toBe(0.7);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });
});

describe('loadConfig', () => {
  it('実測で決めた既定値を持つ', () => {
    const config = loadConfig({ GCP_PROJECT: 'test-project' });
    expect(config.model).toBe('gemini-3.6-flash');
    expect(config.temperature).toBe(0.7);
    expect(config.location).toBe('global');
  });

  it('環境変数で上書きできる', () => {
    const config = loadConfig({ GCP_PROJECT: 'my-proj', GEMINI_MODEL: 'other' });
    expect(config.project).toBe('my-proj');
    expect(config.model).toBe('other');
    expect(config.bucket).toBe('gs://my-proj-hidock');
  });

  it('GCP_PROJECT が未設定なら例外を投げる', () => {
    expect(() => loadConfig({})).toThrow(GCP_PROJECT_ERROR);
  });
});
