import { describe, expect, it } from 'vitest';

import { notify } from '../src/notify.ts';

import { fakeRunner } from './support/fake-runner.ts';

describe('notify', () => {
  it('osascript で通知を出す', async () => {
    const runner = fakeRunner();
    await notify(runner, { title: 'HiDock', message: '2件作成しました' });

    expect(runner.calls[0]?.command).toBe('osascript');
    expect(runner.calls[0]?.args[0]).toBe('-e');
    expect(runner.calls[0]?.args[1]).toContain('display notification "2件作成しました"');
    expect(runner.calls[0]?.args[1]).toContain('with title "HiDock"');
  });

  it('二重引用符をエスケープする（AppleScript が壊れないように）', async () => {
    const runner = fakeRunner();
    await notify(runner, { title: 'T', message: 'a"b' });

    expect(runner.calls[0]?.args[1]).toContain('a\\"b');
  });

  it('バックスラッシュもエスケープする', async () => {
    const runner = fakeRunner();
    await notify(runner, { title: 'T', message: 'a\\b' });

    expect(runner.calls[0]?.args[1]).toContain('a\\\\b');
  });
});
