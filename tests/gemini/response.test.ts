import { describe, expect, it } from 'vitest';

import {
  estimateCostUsd,
  GeminiApiError,
  parseGeminiResponse,
} from '../../src/gemini/response.ts';

/** 実際の応答と同じ形 */
function okResponse(text: string, finishReason = 'STOP'): unknown {
  return {
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
    usageMetadata: {
      promptTokensDetails: [
        { modality: 'AUDIO', tokenCount: 58_621 },
        { modality: 'TEXT', tokenCount: 100 },
      ],
      candidatesTokenCount: 21,
    },
  };
}

describe('parseGeminiResponse', () => {
  it('本文と finishReason を取り出す', () => {
    const out = parseGeminiResponse(okResponse('話者A: はい'));
    expect(out.text).toBe('話者A: はい');
    expect(out.finishReason).toBe('STOP');
  });

  it('複数 part を連結する', () => {
    const raw = {
      candidates: [
        { content: { parts: [{ text: 'あ' }, { text: 'い' }] }, finishReason: 'STOP' },
      ],
    };
    expect(parseGeminiResponse(raw).text).toBe('あい');
  });

  it('音声・文字・出力のトークンを分けて数える', () => {
    const { usage } = parseGeminiResponse(okResponse('x'));
    expect(usage.audioTokens).toBe(58_621);
    expect(usage.textTokens).toBe(100);
    expect(usage.outputTokens).toBe(21);
  });

  it('thoughtsTokenCount も出力に加算する', () => {
    const raw = {
      candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
      usageMetadata: { candidatesTokenCount: 10, thoughtsTokenCount: 5 },
    };
    expect(parseGeminiResponse(raw).usage.outputTokens).toBe(15);
  });

  it('打ち切りは例外にせず finishReason で返す（再試行の判断は呼び出し側）', () => {
    const out = parseGeminiResponse(okResponse('途中まで', 'MAX_TOKENS'));
    expect(out.finishReason).toBe('MAX_TOKENS');
  });

  it.each([
    { error: { message: '権限がない' } },
    { candidates: [] },
    { candidates: ['不正'] },
    null,
    '文字列',
  ])('異常な応答 %# は GeminiApiError', (raw: unknown) => {
    expect(() => parseGeminiResponse(raw)).toThrow(GeminiApiError);
  });

  it('エラーメッセージを例外に含める', () => {
    expect(() => parseGeminiResponse({ error: { message: '権限がない' } })).toThrow(
      '権限がない',
    );
  });

  it('finishReason が無ければ UNKNOWN', () => {
    expect(
      parseGeminiResponse({ candidates: [{ content: { parts: [] } }] }).finishReason,
    ).toBe('UNKNOWN');
  });
});

describe('estimateCostUsd', () => {
  it('39分の会議で実測値とほぼ一致する', () => {
    // 実測: 音声 58,621 tok / 出力 21 tok → $0.0881
    const cost = estimateCostUsd({
      audioTokens: 58_621,
      textTokens: 0,
      outputTokens: 21,
    });
    expect(cost).toBeCloseTo(0.0881, 3);
  });

  it('トークンが無ければ 0', () => {
    expect(estimateCostUsd({ audioTokens: 0, textTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
