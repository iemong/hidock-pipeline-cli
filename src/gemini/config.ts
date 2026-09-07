/**
 * Gemini / GCS configuration.
 *
 * Most values are tuned from real-world testing.
 * `GCP_PROJECT` has no default — every user has their own GCP project, so we
 * fail fast with setup instructions rather than silently pointing at someone else's.
 */

import process from 'node:process';
export interface GeminiConfig {
  readonly project: string;
  readonly location: string;
  readonly model: string;
  readonly temperature: number;
  readonly bucket: string;
  readonly maxOutputTokens: number;
  readonly maxAttempts: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GeminiConfig {
  const project = env['GCP_PROJECT'];
  if (project === undefined || project === '') {
    throw new Error(
      'GCP_PROJECT is not set. Run `gcloud config set project <PROJECT_ID>` and ' +
        'export GCP_PROJECT=<PROJECT_ID> before running hidock (see README for setup).',
    );
  }

  return {
    project,
    // 3.6-flash は global エンドポイント専用（us-central1 は 404 になる）
    location: 'global',
    // 2.5 系は 2026-10-16 廃止予定。flash-lite は暴走するため使わない
    model: env['GEMINI_MODEL'] ?? 'gemini-3.6-flash',
    // 0 と 0.3 はループ暴走、1.0 は誤認識増。実測での最適点
    temperature: 0.7,
    bucket: env['HIDOCK_BUCKET'] ?? `gs://${project}-hidock`,
    maxOutputTokens: 65_535,
    // finishReason が STOP 以外なら作り直す。temperature だけでは防げない
    maxAttempts: 3,
  };
}

export function endpointFor(config: GeminiConfig): string {
  return (
    `https://aiplatform.googleapis.com/v1/projects/${config.project}` +
    `/locations/${config.location}/publishers/google/models/${config.model}:generateContent`
  );
}
