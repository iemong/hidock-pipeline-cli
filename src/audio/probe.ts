import type { CommandRunner } from '../exec.ts';

/**
 * 音声の長さを ffprobe で調べる。
 *
 * デバイスが報告する duration は使わない。上流の計算式が 24kbps 固定で、
 * P1 (96kbps) では実際の4倍の値になるため。長さはファイルから直接測る。
 */
export async function probeDurationSeconds(
  runner: CommandRunner,
  filePath: string,
): Promise<number> {
  const { stdout } = await runner.run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    filePath,
  ]);

  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`音声の長さを取得できない: ${filePath} (出力: ${stdout.trim()})`);
  }

  return seconds;
}

/** 秒を「1時間5分」のような表示に整える */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  if (minutes > 0) {
    return `${minutes}分`;
  }
  return `${total}秒`;
}
