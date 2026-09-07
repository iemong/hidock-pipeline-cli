import { parseRecording } from '../classify.ts';

import { Command, type FileEntry, parseFileList } from './protocol.ts';
import type { RecorderDevice, Recording } from './types.ts';
import { openTransport, type Transport } from './usb-transport.ts';

/** 転送は実測で 8.8MB/1.1秒。大きめに取っておく */
const TRANSFER_TIMEOUT_MS = 300_000;

/**
 * 一覧取得の試行回数。
 *
 * 前のプロセスが接続を手放した直後などに `transferIn error: Cancelled`
 * が出ることがある。再実行すれば成功するため、ここで吸収する。
 * 一覧取得は冪等なので再試行しても副作用がない。
 */
const LIST_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchListing(transport: Transport): Promise<readonly Recording[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= LIST_ATTEMPTS; attempt += 1) {
    try {
      const body = await transport.request(Command.GET_FILE_LIST);
      return parseFileList(body)
        .map(toRecording)
        .filter((r): r is Recording => r !== null);
    } catch (error) {
      lastError = error;
      if (attempt < LIST_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

export interface UsbRecorderDevice extends RecorderDevice {
  readonly close: () => Promise<void>;
}

function toRecording(entry: FileEntry): Recording | null {
  const parsed = parseRecording(entry.name);
  if (parsed === null) {
    return null;
  }
  return {
    name: entry.name,
    sizeBytes: entry.lengthBytes,
    recordedAt: parsed.recordedAt,
    kind: parsed.kind,
    signature: entry.signature,
  };
}

/**
 * 実機（HiDock P1）に接続した RecorderDevice を返す。
 *
 * 削除とフォーマットは実装しない。`RecorderDevice` に無いだけでなく、
 * `protocol.ts` にコマンド定数も置いていないため送る手段が無い。
 */
export function createUsbDevice(transport: Transport): UsbRecorderDevice {
  return {
    listRecordings: () => fetchListing(transport),

    downloadRecording: async (recording: Recording): Promise<Uint8Array> => {
      const data = await transport.request(Command.TRANSFER_FILE, {
        body: new TextEncoder().encode(recording.name),
        timeoutMs: TRANSFER_TIMEOUT_MS,
        expectedBytes: recording.sizeBytes,
      });

      // 途中で切れた場合は黙って進めない。
      // 短いファイルとして扱われると too-short で静かに捨てられる。
      if (data.length < recording.sizeBytes) {
        throw new Error(
          `録音を最後まで取得できなかった: ${recording.name} ` +
            `(${data.length}/${recording.sizeBytes} bytes)`,
        );
      }
      return data;
    },

    close: transport.close,
  };
}

/** 接続から実装の生成までをまとめて行う */
export async function openUsbDevice(): Promise<UsbRecorderDevice> {
  return createUsbDevice(await openTransport());
}
