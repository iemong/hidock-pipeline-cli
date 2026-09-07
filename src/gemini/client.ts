import { endpointFor, type GeminiConfig } from './config.ts';
import { type GeminiOutput, parseGeminiResponse } from './response.ts';

export interface GenerateRequest {
  readonly fileUri: string;
  readonly mimeType: string;
  readonly prompt: string;
}

export interface GenerateResult extends GeminiOutput {
  readonly attempts: number;
}

export interface GeminiDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly token: () => Promise<string>;
}

/** これ以外の finishReason は生成が正常に終わっていない */
const SUCCESS = 'STOP';

export class GenerationIncompleteError extends Error {
  readonly finishReason: string;

  constructor(finishReason: string, attempts: number) {
    super(
      `Generation did not complete (finishReason=${finishReason}, ${attempts} attempt(s)). ` +
        'Raising temperature does not prevent this — split the input or check it manually.',
    );
    this.name = 'GenerationIncompleteError';
    this.finishReason = finishReason;
  }
}

function buildBody(config: GeminiConfig, request: GenerateRequest): string {
  return JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { mimeType: request.mimeType, fileUri: request.fileUri } },
          { text: request.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      // 文字起こしに思考は不要。コストと時間だけ増える
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
}

async function callOnce(
  deps: GeminiDeps,
  config: GeminiConfig,
  request: GenerateRequest,
): Promise<GeminiOutput> {
  const response = await deps.fetch(endpointFor(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await deps.token()}`,
      'Content-Type': 'application/json',
    },
    body: buildBody(config, request),
  });

  return parseGeminiResponse(await response.json());
}

/**
 * 音声から Markdown を生成する。
 *
 * finishReason が STOP 以外なら作り直す。実測では temperature 0.7 でも
 * 条件次第でループ暴走が起きており、finishReason の確認が唯一の確実な防御。
 */
export async function generate(
  deps: GeminiDeps,
  config: GeminiConfig,
  request: GenerateRequest,
): Promise<GenerateResult> {
  let last: GeminiOutput | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    last = await callOnce(deps, config, request);
    if (last.finishReason === SUCCESS) {
      return { ...last, attempts: attempt };
    }
  }

  const reason = last === null ? 'UNKNOWN' : last.finishReason;
  throw new GenerationIncompleteError(reason, config.maxAttempts);
}
