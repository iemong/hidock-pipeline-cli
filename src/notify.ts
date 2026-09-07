import type { CommandRunner } from './exec.ts';

/** AppleScript の文字列リテラルを壊す文字 */
const NEEDS_ESCAPE = /["\\]/g;

function quote(text: string): string {
  return text.replace(NEEDS_ESCAPE, '\\$&');
}

/**
 * macOS の通知センターに出す。
 *
 * ユーザーがこのパイプラインに触れる唯一の接点。
 * 「降ってきたものを読む」以外の操作を要求しないための出口。
 */
export async function notify(
  runner: CommandRunner,
  options: { readonly title: string; readonly message: string },
): Promise<void> {
  await runner.run('osascript', [
    '-e',
    `display notification "${quote(options.message)}" with title "${quote(options.title)}"`,
  ]);
}
