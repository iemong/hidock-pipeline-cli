import { describe, expect, it } from 'vitest';

import {
  type ChunkReader,
  concat,
  IncompleteResponseError,
  readBody,
} from '../../src/device/stream.ts';

function readerOf(...chunks: readonly number[][]): ChunkReader {
  const queue = chunks.map((c) => new Uint8Array(c));
  return {
    read: () => Promise.resolve(queue.shift() ?? new Uint8Array(0)),
  };
}

const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

describe('concat', () => {
  it('チャンクを順に連結する', () => {
    const out = concat([new Uint8Array([1, 2]), new Uint8Array([3])], 3);
    expect([...out]).toEqual([1, 2, 3]);
  });

  it('指定長で切り詰める', () => {
    const out = concat([new Uint8Array([1, 2, 3, 4])], 2);
    expect([...out]).toEqual([1, 2]);
  });

  it('指定長に満たなければ 0 埋めのまま返す', () => {
    const out = concat([new Uint8Array([1])], 3);
    expect([...out]).toEqual([1, 0, 0]);
  });

  it('空の入力では空の結果', () => {
    expect([...concat([], 0)]).toEqual([]);
  });

  it('余ったチャンクは捨てる', () => {
    const out = concat([new Uint8Array([1, 2]), new Uint8Array([3, 4])], 2);
    expect([...out]).toEqual([1, 2]);
  });
});

describe('readBody', () => {
  it('最初のチャンクだけで足りればそのまま返す', async () => {
    const body = await readBody({
      reader: readerOf(),
      first: new Uint8Array([1, 2, 3]),
      bodyLength: 3,
      deadline: FAR_FUTURE,
    });
    expect([...body]).toEqual([1, 2, 3]);
  });

  it('足りない分を読み継ぐ', async () => {
    const body = await readBody({
      reader: readerOf([3, 4], [5]),
      first: new Uint8Array([1, 2]),
      bodyLength: 5,
      deadline: FAR_FUTURE,
    });
    expect([...body]).toEqual([1, 2, 3, 4, 5]);
  });

  it('多く届いても指定長に切り詰める', async () => {
    const body = await readBody({
      reader: readerOf([3, 4, 5, 6]),
      first: new Uint8Array([1, 2]),
      bodyLength: 4,
      deadline: FAR_FUTURE,
    });
    expect([...body]).toEqual([1, 2, 3, 4]);
  });

  it('送信が止まったらそこまでを返す（無限に待たない）', async () => {
    const body = await readBody({
      reader: readerOf([3]),
      first: new Uint8Array([1, 2]),
      bodyLength: 100,
      deadline: FAR_FUTURE,
    });
    expect([...body]).toEqual([1, 2, 3]);
  });

  it('期限を過ぎたら受信済み量を添えて失敗する', async () => {
    await expect(
      readBody({
        reader: readerOf([9]),
        first: new Uint8Array([1]),
        bodyLength: 10,
        deadline: 0,
        now: () => 1,
      }),
    ).rejects.toBeInstanceOf(IncompleteResponseError);
  });

  it('失敗時のエラーに received と expected が入る', async () => {
    const error = await readBody({
      reader: readerOf([9]),
      first: new Uint8Array([1, 2, 3]),
      bodyLength: 99,
      deadline: 0,
      now: () => 1,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IncompleteResponseError);
    expect((error as IncompleteResponseError).received).toBe(3);
    expect((error as IncompleteResponseError).expected).toBe(99);
  });
});
