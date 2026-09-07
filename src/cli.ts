#!/usr/bin/env node
import process from 'node:process';

import { openUsbDevice } from './device/usb-device.ts';
import { systemRunner } from './exec.ts';
import { accessToken } from './gcs/upload.ts';
import { type GeminiConfig, loadConfig } from './gemini/config.ts';
import { notify } from './notify.ts';
import { defaultPaths, type PipelineContext } from './pipeline/context.ts';
import { runPipeline } from './pipeline/run.ts';
import { collectStatus, formatStatus, toStatusJson } from './pipeline/status.ts';
import { describeSummary } from './pipeline/types.ts';
import { loadProcessedStore } from './state/processed.ts';

interface Args {
  readonly listOnly: boolean;
  readonly selectAll: boolean;
  readonly asJson: boolean;
  readonly pick: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const pickAt = argv.indexOf('--pick');
  const positional = argv.filter((a) => !a.startsWith('-'));

  return {
    listOnly: argv.includes('--list'),
    selectAll: argv.includes('--all'),
    asJson: argv.includes('--json'),
    // --pick Rec14 でも、位置引数（Raycast の argument）でも受ける
    pick: pickAt >= 0 ? argv[pickAt + 1] : positional[0],
  };
}

/** Placeholder used for --list, which never reads Gemini/GCS config. */
const UNUSED_CONFIG: GeminiConfig = {
  project: '',
  location: '',
  model: '',
  temperature: 0,
  bucket: '',
  maxOutputTokens: 0,
  maxAttempts: 0,
};

async function buildContext(
  args: Args,
): Promise<PipelineContext & { close: () => Promise<void> }> {
  const runner = systemRunner;
  const paths = defaultPaths();
  const device = await openUsbDevice();

  return {
    device,
    runner,
    // Listing never touches Gemini/GCS, so don't force GCP_PROJECT setup
    // just to see what's pending.
    config: args.listOnly ? UNUSED_CONFIG : loadConfig(),
    paths,
    processed: await loadProcessedStore(paths.stateFile),
    gemini: { fetch: globalThis.fetch, token: () => accessToken(runner) },
    close: device.close,
  };
}

/**
 * 入口。
 *
 * 引数なし  : 未取り込みを一覧表示して選ばせる
 * --list    : 状況を表示するだけ（処理しない）
 * Rec14     : 名前で指定して取り込む（Raycast の引数）
 * --all     : 未取り込みを全て取り込む
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const context = await buildContext(args);

  try {
    if (args.listOnly) {
      const status = await collectStatus(context);
      const output = args.asJson
        ? JSON.stringify(toStatusJson(status))
        : formatStatus(status);
      process.stdout.write(`${output}\n`);
      return 0;
    }

    const summary = await runPipeline(context, {
      selectAll: args.selectAll,
      pick: args.pick,
    });

    const message = describeSummary(summary);
    process.stdout.write(`${message}\n`);

    // 何が処理され、何がなぜ外れたかを必ず出す。
    // 黙って取りこぼすと「全部処理された」と誤解する。
    for (const result of summary.results) {
      if (result.status === 'processed') {
        process.stdout.write(`  [created] ${result.recording.name}\n`);
        process.stdout.write(`         ${result.notePath}\n`);
      } else if (result.reason !== 'not-selected') {
        process.stdout.write(
          `  [excluded] ${result.recording.name} (${result.reason}: ${result.detail})\n`,
        );
      }
    }

    if (summary.processed.length > 0) {
      await notify(context.runner, { title: 'HiDock', message });
    }

    return 0;
  } finally {
    await context.close();
  }
}

try {
  process.exitCode = await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);

  try {
    await notify(systemRunner, { title: 'HiDock', message: `Failed: ${message}` });
  } catch {
    // 通知が出せなくても終了処理は続ける
  }

  process.exitCode = 1;
}
