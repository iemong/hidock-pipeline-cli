import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import type { RecorderDevice } from '../device/types.ts';
import type { CommandRunner } from '../exec.ts';
import type { GeminiDeps } from '../gemini/client.ts';
import type { GeminiConfig } from '../gemini/config.ts';
import type { ProcessedStore } from '../state/processed.ts';

export interface PipelinePaths {
  /** 音声の作業領域。iCloud の外に置く */
  readonly inbox: string;
  /** ノートの出力先（Obsidian Vault 内） */
  readonly noteDir: string;
  /** 取り込み済みの記録 */
  readonly stateFile: string;
}

export interface PipelineContext {
  readonly device: RecorderDevice;
  readonly runner: CommandRunner;
  readonly gemini: GeminiDeps;
  readonly config: GeminiConfig;
  readonly processed: ProcessedStore;
  readonly paths: PipelinePaths;
  /** 固有名詞の認識精度を上げるための語彙 */
  readonly vocabulary?: readonly string[] | undefined;
}

const VAULT_RELATIVE =
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/98-AI-Insights/hidock';

/**
 * 既定のパス。
 *
 * 作業領域は iCloud の外（`~/HiDockInbox/`）に置く。Vault 配下は
 * 未実体化のプレースホルダやメタデータ更新があり、監視や一時ファイルの
 * 置き場所として使うと不安定になるため。出力だけを Vault に書く。
 */
export function defaultPaths(env: NodeJS.ProcessEnv = process.env): PipelinePaths {
  const home = homedir();
  const inbox = env['HIDOCK_INBOX'] ?? join(home, 'HiDockInbox');

  return {
    inbox,
    noteDir: env['HIDOCK_NOTE_DIR'] ?? join(home, VAULT_RELATIVE),
    stateFile: join(inbox, '.processed', 'index.json'),
  };
}
