/**
 * Gemini の応答解析。
 *
 * ネットワークから切り離した純粋関数にしてある。
 * 「途中で打ち切られた」「候補が無い」といった異常系は実際には
 * 起こしにくいため、ここで固定の入力に対して検証する。
 */

export interface TokenUsage {
  readonly audioTokens: number;
  readonly textTokens: number;
  readonly outputTokens: number;
}

export interface GeminiOutput {
  readonly text: string;
  readonly finishReason: string;
  readonly usage: TokenUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sumModality(details: unknown, wantAudio: boolean): number {
  if (!Array.isArray(details)) {
    return 0;
  }
  let total = 0;
  for (const item of details) {
    if (!isRecord(item)) {
      continue;
    }
    const isAudio = item['modality'] === 'AUDIO';
    const count = item['tokenCount'];
    if (isAudio === wantAudio && typeof count === 'number') {
      total += count;
    }
  }
  return total;
}

function extractUsage(raw: unknown): TokenUsage {
  if (!isRecord(raw)) {
    return { audioTokens: 0, textTokens: 0, outputTokens: 0 };
  }
  const details = raw['promptTokensDetails'];
  const candidates = raw['candidatesTokenCount'];
  const thoughts = raw['thoughtsTokenCount'];

  return {
    audioTokens: sumModality(details, true),
    textTokens: sumModality(details, false),
    outputTokens:
      (typeof candidates === 'number' ? candidates : 0) +
      (typeof thoughts === 'number' ? thoughts : 0),
  };
}

function extractText(content: unknown): string {
  if (!(isRecord(content) && Array.isArray(content['parts']))) {
    return '';
  }
  return content['parts']
    .map((part) =>
      isRecord(part) && typeof part['text'] === 'string' ? part['text'] : '',
    )
    .join('');
}

export class GeminiApiError extends Error {
  constructor(detail: string) {
    super(`Gemini API がエラーを返した: ${detail}`);
    this.name = 'GeminiApiError';
  }
}

/**
 * 応答本体を解析する。API がエラーを返した場合は例外にする。
 * 打ち切り（MAX_TOKENS など）は例外にせず finishReason で返し、
 * 呼び出し側が再試行を判断できるようにする。
 */
export function parseGeminiResponse(raw: unknown): GeminiOutput {
  if (!isRecord(raw)) {
    throw new GeminiApiError('応答が JSON オブジェクトではない');
  }

  const error = raw['error'];
  if (isRecord(error)) {
    const message = error['message'];
    throw new GeminiApiError(
      typeof message === 'string' ? message : JSON.stringify(error),
    );
  }

  const candidates = raw['candidates'];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new GeminiApiError('candidates が空');
  }

  const first: unknown = candidates[0];
  if (!isRecord(first)) {
    throw new GeminiApiError('candidates[0] が不正');
  }

  const finishReason = first['finishReason'];

  return {
    text: extractText(first['content']),
    finishReason: typeof finishReason === 'string' ? finishReason : 'UNKNOWN',
    usage: extractUsage(raw['usageMetadata']),
  };
}

/** Standard 単価（USD / 1M tokens）。gemini-3.6-flash */
const RATE = { audio: 1.5, text: 1.5, output: 7.5 } as const;
const PER_MILLION = 1_000_000;

export function estimateCostUsd(usage: TokenUsage): number {
  return (
    (usage.audioTokens * RATE.audio +
      usage.textTokens * RATE.text +
      usage.outputTokens * RATE.output) /
    PER_MILLION
  );
}
