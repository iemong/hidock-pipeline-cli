import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { defaultPaths } from '../../src/pipeline/context.ts';

describe('defaultPaths', () => {
  it('作業領域は iCloud の外に置く', () => {
    const paths = defaultPaths({});

    expect(paths.inbox).toBe(`${homedir()}/HiDockInbox`);
    expect(paths.inbox).not.toContain('Mobile Documents');
  });

  it('出力先は Vault の 98-AI-Insights 配下', () => {
    const paths = defaultPaths({});

    expect(paths.noteDir).toContain('98-AI-Insights/hidock');
    expect(paths.noteDir).toContain('iCloud~md~obsidian');
  });

  it('事実ログ（Timestamps）には書かない', () => {
    expect(defaultPaths({}).noteDir).not.toContain('Timestamps');
  });

  it('取り込み記録は作業領域の中に置く', () => {
    const paths = defaultPaths({});
    expect(paths.stateFile.startsWith(paths.inbox)).toBe(true);
  });

  it('環境変数で上書きできる', () => {
    const paths = defaultPaths({
      HIDOCK_INBOX: '/tmp/in',
      HIDOCK_NOTE_DIR: '/tmp/notes',
    });

    expect(paths.inbox).toBe('/tmp/in');
    expect(paths.noteDir).toBe('/tmp/notes');
    expect(paths.stateFile).toBe('/tmp/in/.processed/index.json');
  });
});
