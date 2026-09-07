import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { defaultPaths } from '../../src/pipeline/context.ts';

describe('defaultPaths', () => {
  it('作業領域は iCloud の外に置く', () => {
    const paths = defaultPaths({});

    expect(paths.inbox).toBe(`${homedir()}/HiDockInbox`);
    expect(paths.inbox).not.toContain('Mobile Documents');
  });

  it('出力先はホーム配下の hidock-notes', () => {
    const paths = defaultPaths({});

    expect(paths.noteDir).toBe(`${homedir()}/Documents/hidock-notes`);
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
