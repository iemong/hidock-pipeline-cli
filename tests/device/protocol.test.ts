import { describe, expect, it } from 'vitest';

import {
  buildPacket,
  Command,
  type FileEntry,
  HEADER_SIZE,
  parseFileList,
  parseResponseHeader,
} from '../../src/device/protocol.ts';

/** デバイスが返す形式でファイル一覧の本体を組み立てる（往復テスト用） */
function encodeFileList(entries: readonly FileEntry[], withHeader = true): Uint8Array {
  const parts: number[] = [];

  if (withHeader) {
    parts.push(0xff, 0xff, 0, 0, 0, entries.length);
  }

  for (const e of entries) {
    const name = [...e.name].map((c) => c.charCodeAt(0));
    parts.push(
      e.version,
      (name.length >> 16) & 0xff,
      (name.length >> 8) & 0xff,
      name.length & 0xff,
      ...name,
      (e.lengthBytes >>> 24) & 0xff,
      (e.lengthBytes >>> 16) & 0xff,
      (e.lengthBytes >>> 8) & 0xff,
      e.lengthBytes & 0xff,
      0,
      0,
      0,
      0,
      0,
      0, // 未使用の6バイト
      ...(e.signature.match(/../g) ?? []).map((h) => Number.parseInt(h, 16)),
    );
  }

  return new Uint8Array(parts);
}

const SAMPLE: FileEntry = {
  name: '2026Jul13-103142-Rec03.hda',
  lengthBytes: 8_816_844,
  signature: 'd52aad03cb9cf53508fed4108864a5a7',
  version: 5,
};

describe('buildPacket', () => {
  it('sync バイトとヘッダ長が仕様どおり', () => {
    const packet = buildPacket(Command.GET_FILE_LIST, 1);
    expect(packet[0]).toBe(0x12);
    expect(packet[1]).toBe(0x34);
    expect(packet).toHaveLength(HEADER_SIZE);
  });

  it('コマンドID・シーケンス・本体長を big-endian で書く', () => {
    const body = new Uint8Array([0xaa, 0xbb]);
    const packet = buildPacket(Command.TRANSFER_FILE, 0x01_02_03_04, body);
    const view = new DataView(packet.buffer);

    expect(view.getUint16(2, false)).toBe(Command.TRANSFER_FILE);
    expect(view.getUint32(4, false)).toBe(0x01_02_03_04);
    expect(view.getUint32(8, false)).toBe(2);
    expect([...packet.subarray(HEADER_SIZE)]).toEqual([0xaa, 0xbb]);
  });

  it('自分で組んだパケットを自分で読み戻せる', () => {
    const packet = buildPacket(Command.GET_DEVICE_INFO, 42);
    const header = parseResponseHeader(packet);

    expect(header).toEqual({
      commandId: Command.GET_DEVICE_INFO,
      sequenceId: 42,
      bodyLength: 0,
    });
  });

  it('削除とフォーマットのコマンドは定義されていない', () => {
    expect(Object.values(Command)).toEqual([1, 4, 5]);
  });
});

describe('parseResponseHeader', () => {
  it('sync が違えば null', () => {
    const buf = new Uint8Array(HEADER_SIZE);
    buf[0] = 0x99;
    expect(parseResponseHeader(buf)).toBeNull();
  });

  it('ヘッダ長に満たなければ null', () => {
    expect(parseResponseHeader(new Uint8Array([0x12, 0x34]))).toBeNull();
  });

  it('本体長の上位1バイトは無視する（予約領域）', () => {
    const packet = buildPacket(Command.GET_FILE_LIST, 1);
    const view = new DataView(packet.buffer);
    view.setUint32(8, 0xff_00_00_10, false);

    expect(parseResponseHeader(packet)?.bodyLength).toBe(0x10);
  });
});

describe('parseFileList', () => {
  it('組み立てた一覧をそのまま読み戻せる', () => {
    const parsed = parseFileList(encodeFileList([SAMPLE]));
    expect(parsed).toEqual([SAMPLE]);
  });

  it('複数件を順に読める', () => {
    const second: FileEntry = { ...SAMPLE, name: '2026Jul14-120022-Rec06.hda' };
    const parsed = parseFileList(encodeFileList([SAMPLE, second]));

    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.name).toBe(second.name);
  });

  it('先頭ヘッダが無くても読める', () => {
    const parsed = parseFileList(encodeFileList([SAMPLE], false));
    expect(parsed).toEqual([SAMPLE]);
  });

  it('ヘッダの件数を超えて読まない', () => {
    const body = encodeFileList([SAMPLE, SAMPLE]);
    body[5] = 1; // 総数を1に偽装する
    expect(parseFileList(body)).toHaveLength(1);
  });

  it('途中で切れていたらそこまでを返す（例外を投げない）', () => {
    const full = encodeFileList([SAMPLE, SAMPLE]);
    const truncated = full.subarray(0, full.length - 10);

    expect(parseFileList(truncated)).toHaveLength(1);
  });

  it('空の本体では空配列', () => {
    expect(parseFileList(new Uint8Array(0))).toEqual([]);
  });

  it('ファイル名末尾の NUL を落とす', () => {
    const padded: FileEntry = { ...SAMPLE, name: `${SAMPLE.name}\0\0` };
    const parsed = parseFileList(encodeFileList([padded]));

    expect(parsed[0]?.name).toBe(SAMPLE.name);
  });
});
