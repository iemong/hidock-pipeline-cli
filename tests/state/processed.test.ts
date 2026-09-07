import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadProcessedStore } from '../../src/state/processed.ts';

async function tempFile(name = 'processed.json'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hidock-test-'));
  return join(dir, name);
}

const ENTRY = {
  signature: 'd52aad03cb9cf53508fed4108864a5a7',
  name: '2026Jul13-103142-Rec03.hda',
  processedAt: '2026-07-28T00:00:00.000Z',
};

describe('loadProcessedStore', () => {
  it('存在しないファイルなら空から始まる', async () => {
    const store = await loadProcessedStore(await tempFile());

    expect(store.size()).toBe(0);
    expect(store.has(ENTRY.signature)).toBe(false);
  });

  it('追加した signature を覚える', async () => {
    const store = await loadProcessedStore(await tempFile());
    await store.add(ENTRY);

    expect(store.has(ENTRY.signature)).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('保存した内容を次回読み込める（再取り込みを防ぐ）', async () => {
    const path = await tempFile();
    const first = await loadProcessedStore(path);
    await first.add(ENTRY);

    const second = await loadProcessedStore(path);
    expect(second.has(ENTRY.signature)).toBe(true);
  });

  it('同じ signature を二重に足さない', async () => {
    const path = await tempFile();
    const store = await loadProcessedStore(path);
    await store.add(ENTRY);
    await store.add({ ...ENTRY, name: '別名.hda' });

    expect(store.size()).toBe(1);
    const saved: unknown = JSON.parse(await readFile(path, 'utf8'));
    expect(saved).toHaveLength(1);
  });

  it('ファイル名が違っても signature が同じなら取り込み済みとみなす', async () => {
    const store = await loadProcessedStore(await tempFile());
    await store.add(ENTRY);

    expect(store.has(ENTRY.signature)).toBe(true);
  });

  it('壊れた記録は空として扱う（読めないより再取り込みを選ぶ）', async () => {
    const path = await tempFile();
    await writeFile(path, '{壊れている', 'utf8');

    const store = await loadProcessedStore(path);
    expect(store.size()).toBe(0);
  });

  it('配列でない JSON も空として扱う', async () => {
    const path = await tempFile();
    await writeFile(path, '{"a":1}', 'utf8');

    await expect(loadProcessedStore(path).then((s) => s.size())).resolves.toBe(0);
  });

  it('signature を持たない要素は無視する', async () => {
    const path = await tempFile();
    await writeFile(path, JSON.stringify([{ name: 'x' }, ENTRY]), 'utf8');

    const store = await loadProcessedStore(path);
    expect(store.size()).toBe(1);
  });
});
