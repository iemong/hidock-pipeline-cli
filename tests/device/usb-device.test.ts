import { describe, expect, it, vi } from 'vitest';

import {
  buildPacket,
  Command,
  type CommandId,
  type FileEntry,
  HEADER_SIZE,
} from '../../src/device/protocol.ts';
import { createUsbDevice } from '../../src/device/usb-device.ts';
import type { RequestOptions, Transport } from '../../src/device/usb-transport.ts';

const RECORDING = {
  name: '2026Jul13-103142-Rec03.hda',
  sizeBytes: 128,
  recordedAt: new Date(2026, 6, 13, 10, 31, 42),
  kind: 'meeting',
  signature: 'd52aad03cb9cf53508fed4108864a5a7',
} as const;

const SAMPLE: FileEntry = {
  name: '2026Jul13-103142-Rec03.hda',
  lengthBytes: 8_816_844,
  signature: 'd52aad03cb9cf53508fed4108864a5a7',
  version: 5,
};

/** protocol.test.ts と同じ形式で一覧の本体を組む */
function encodeFileList(entries: readonly FileEntry[]): Uint8Array {
  const parts: number[] = [0xff, 0xff, 0, 0, 0, entries.length];
  for (const e of entries) {
    const name = [...e.name].map((c) => c.charCodeAt(0));
    parts.push(
      e.version,
      0,
      0,
      name.length,
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
      0,
      ...(e.signature.match(/../g) ?? []).map((h) => Number.parseInt(h, 16)),
    );
  }
  return new Uint8Array(parts);
}

function stubTransport(
  handler: (commandId: CommandId, options?: RequestOptions) => Uint8Array,
): Transport & { readonly closed: () => boolean } {
  let closed = false;
  return {
    request: (commandId, options) => Promise.resolve(handler(commandId, options)),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
    closed: () => closed,
  };
}

describe('createUsbDevice', () => {
  it('一覧コマンドを送り、結果を Recording に変換する', async () => {
    const seen: CommandId[] = [];
    const device = createUsbDevice(
      stubTransport((cmd) => {
        seen.push(cmd);
        return encodeFileList([SAMPLE]);
      }),
    );

    const recordings = await device.listRecordings();

    expect(seen).toEqual([Command.GET_FILE_LIST]);
    expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({
      name: SAMPLE.name,
      sizeBytes: SAMPLE.lengthBytes,
      signature: SAMPLE.signature,
      kind: 'meeting',
    });
  });

  it('ファイル名が既知の形式でない録音は除外する', async () => {
    const odd: FileEntry = { ...SAMPLE, name: 'UNKNOWN.hda' };
    const device = createUsbDevice(stubTransport(() => encodeFileList([SAMPLE, odd])));

    await expect(device.listRecordings()).resolves.toHaveLength(1);
  });

  it('取得はファイル名を本体に載せ、期待サイズを渡す', async () => {
    const received: string[] = [];
    let expectedBytes: number | undefined;
    const device = createUsbDevice(
      stubTransport((_cmd, options) => {
        received.push(new TextDecoder().decode(options?.body));
        expectedBytes = options?.expectedBytes;
        return new Uint8Array(RECORDING.sizeBytes);
      }),
    );

    await expect(device.downloadRecording(RECORDING)).resolves.toHaveLength(
      RECORDING.sizeBytes,
    );
    expect(received).toEqual([SAMPLE.name]);
    expect(expectedBytes).toBe(RECORDING.sizeBytes);
  });

  it('途中で切れた応答は失敗させる（短いファイルとして静かに捨てない）', async () => {
    const device = createUsbDevice(stubTransport(() => new Uint8Array(10)));

    await expect(device.downloadRecording(RECORDING)).rejects.toThrow(
      'Could not fully download recording',
    );
  });

  it('close は transport に委譲する', async () => {
    const transport = stubTransport(() => new Uint8Array(0));
    const device = createUsbDevice(transport);

    await device.close();

    expect(transport.closed()).toBe(true);
  });

  it('削除やフォーマットの手段を持たない', () => {
    const device = createUsbDevice(stubTransport(() => new Uint8Array(0)));

    expect(Object.keys(device).sort()).toEqual([
      'close',
      'downloadRecording',
      'listRecordings',
    ]);
  });
});

describe('プロトコルとの整合', () => {
  it('送信パケットのヘッダは 12 バイト', () => {
    const spy = vi.fn(() => new Uint8Array(0));
    expect(buildPacket(Command.GET_FILE_LIST, 1, spy())).toHaveLength(HEADER_SIZE);
  });
});
