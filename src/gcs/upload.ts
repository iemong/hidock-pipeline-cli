import type { CommandRunner } from '../exec.ts';

/** バケット指定の末尾スラッシュを揃えるため */
const TRAILING_SLASHES = /\/+$/;

/**
 * 音声を Cloud Storage に置き、`gs://` URI を返す。
 *
 * inline (base64) では 30分を超える会議が 20MB 上限に当たるため、
 * 音声は必ず GCS 経由で渡す（実機16本中5本が上限超過）。
 *
 * バケットには7日で自動削除するライフサイクルルールを設定してあるので、
 * 取り込みごとの後片付けは不要。
 */
export async function uploadAudio(
  runner: CommandRunner,
  options: {
    readonly localPath: string;
    readonly bucket: string;
    readonly objectName: string;
    readonly project: string;
  },
): Promise<string> {
  const uri = `${options.bucket.replace(TRAILING_SLASHES, '')}/audio/${options.objectName}`;

  await runner.run('gcloud', [
    'storage',
    'cp',
    options.localPath,
    uri,
    `--project=${options.project}`,
  ]);

  return uri;
}

/** Vertex AI の呼び出しに使うアクセストークンを取得する */
export async function accessToken(runner: CommandRunner): Promise<string> {
  const { stdout } = await runner.run('gcloud', ['auth', 'print-access-token']);
  const token = stdout.trim();

  if (token.length === 0) {
    throw new Error(
      'アクセストークンを取得できない。`gcloud auth login` を実行すること。',
    );
  }

  return token;
}
