import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * 外部コマンドの実行。
 *
 * ffprobe / gcloud / osascript はいずれも実環境に依存するため、
 * ここを差し替え可能にしてテストから切り離す。
 */
export interface CommandRunner {
  readonly run: (
    command: string,
    args: readonly string[],
    timeoutMs?: number,
  ) => Promise<CommandResult>;
}

export class CommandFailedError extends Error {
  readonly command: string;
  readonly stderr: string;

  constructor(command: string, stderr: string, cause?: unknown) {
    super(`Command failed: ${command}\n${stderr}`, { cause });
    this.name = 'CommandFailedError';
    this.command = command;
    this.stderr = stderr;
  }
}

const DEFAULT_TIMEOUT_MS = 600_000;
/** 音声を base64 で渡す場面は無いが、gcloud の出力が大きくなることがある */
const MAX_BUFFER = 64 * 1024 * 1024;

export const systemRunner: CommandRunner = {
  run: async (command, args, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CommandResult> => {
    try {
      const { stdout, stderr } = await execFileAsync(command, [...args], {
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
      });
      return { stdout, stderr };
    } catch (cause) {
      const stderr = cause instanceof Error ? cause.message : String(cause);
      throw new CommandFailedError(command, stderr, cause);
    }
  },
};
