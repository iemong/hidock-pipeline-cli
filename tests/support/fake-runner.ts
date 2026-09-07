import type { CommandResult, CommandRunner } from '../../src/exec.ts';

export interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
}

export interface FakeRunner extends CommandRunner {
  readonly calls: readonly RecordedCall[];
}

/**
 * 外部コマンドを差し替えるテスト用の実装。
 * ffprobe / gcloud を実際に叩かずに、呼び出し内容を検証する。
 */
export function fakeRunner(
  responses: Readonly<Record<string, CommandResult | Error>> = {},
): FakeRunner {
  const calls: RecordedCall[] = [];

  return {
    calls,
    run: (command, args) => {
      calls.push({ command, args: [...args] });
      const response = responses[command];
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve(response ?? { stdout: '', stderr: '' });
    },
  };
}
