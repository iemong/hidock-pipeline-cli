/**
 * HiDock Jensen プロトコルのパケット組み立てと解析。
 *
 * USB 通信から切り離した純粋関数として置く。
 * ここが純粋であれば、実機なしでプロトコルの正しさを検証できる。
 *
 * パケット構造:
 *   0x12 0x34    sync (2)
 *   commandId    big-endian uint16 (2)
 *   sequenceId   big-endian uint32 (4)
 *   bodyLength   big-endian uint32 (4)  ※上位1バイトは予約
 *   body         可変長
 */

/**
 * 使用するコマンドのみ定義する。
 * 削除(7) とフォーマット(17) は**意図的に定義しない**。
 * 定数が無ければ誤って送ることもできない。
 */
export const Command = {
  GET_DEVICE_INFO: 1,
  GET_FILE_LIST: 4,
  TRANSFER_FILE: 5,
} as const;

export type CommandId = (typeof Command)[keyof typeof Command];

export const HEADER_SIZE = 12;
const SYNC_0 = 0x12;
const SYNC_1 = 0x34;

export interface ResponseHeader {
  readonly commandId: number;
  readonly sequenceId: number;
  readonly bodyLength: number;
}

/** デバイスが返す録音1件の生データ */
export interface FileEntry {
  readonly name: string;
  readonly lengthBytes: number;
  readonly signature: string;
  readonly version: number;
}

export function buildPacket(
  commandId: CommandId,
  sequenceId: number,
  body: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const packet = new Uint8Array(HEADER_SIZE + body.length);
  const view = new DataView(packet.buffer);

  packet[0] = SYNC_0;
  packet[1] = SYNC_1;
  view.setUint16(2, commandId, false);
  view.setUint32(4, sequenceId >>> 0, false);
  view.setUint32(8, body.length, false);
  packet.set(body, HEADER_SIZE);

  return packet;
}

/**
 * 応答ヘッダを読む。sync が合わない・長さが足りない場合は null。
 *
 * bodyLength の上位1バイトは予約領域なので下位3バイトのみを使う。
 */
export function parseResponseHeader(buffer: Uint8Array): ResponseHeader | null {
  if (buffer.length < HEADER_SIZE) {
    return null;
  }
  if (buffer[0] !== SYNC_0 || buffer[1] !== SYNC_1) {
    return null;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    commandId: view.getUint16(2, false),
    sequenceId: view.getUint32(4, false),
    bodyLength: view.getUint32(8, false) & 0x00_ff_ff_ff,
  };
}

const ENTRY_TAIL_SIZE = 4 + 6 + 16; // length + 予約 + signature
const SIGNATURE_SIZE = 16;
/** ファイル名は固定長領域に NUL で埋められて返る */
const TRAILING_NULS = /\0+$/;

interface EntryReadResult {
  readonly entry: FileEntry;
  readonly nextOffset: number;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readEntry(data: Uint8Array, offset: number): EntryReadResult | null {
  if (offset + 4 > data.length) {
    return null;
  }

  const version = data[offset] ?? 0;
  const nameLength =
    ((data[offset + 1] ?? 0) << 16) |
    ((data[offset + 2] ?? 0) << 8) |
    (data[offset + 3] ?? 0);
  let cursor = offset + 4;

  if (nameLength <= 0 || cursor + nameLength + ENTRY_TAIL_SIZE > data.length) {
    return null;
  }

  const nameBytes = data.subarray(cursor, cursor + nameLength);
  const name = new TextDecoder('ascii').decode(nameBytes).replace(TRAILING_NULS, '');
  cursor += nameLength;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lengthBytes = view.getUint32(cursor, false);
  cursor += 4 + 6; // 長さの後ろ6バイトは未使用

  const signature = toHex(data.subarray(cursor, cursor + SIGNATURE_SIZE));
  cursor += SIGNATURE_SIZE;

  return { entry: { name, lengthBytes, signature, version }, nextOffset: cursor };
}

/**
 * ファイル一覧の本体を解析する。
 *
 * 先頭に `0xFF 0xFF` + 総数(4) のヘッダが付く場合がある。
 * 壊れた位置で解析を打ち切り、そこまでの結果を返す。
 */
export function parseFileList(body: Uint8Array): readonly FileEntry[] {
  const entries: FileEntry[] = [];
  let offset = 0;
  let expected = -1;

  if (body.length >= 6 && body[0] === 0xff && body[1] === 0xff) {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    expected = view.getUint32(2, false);
    offset = 6;
  }

  while (offset < body.length && (expected < 0 || entries.length < expected)) {
    const result = readEntry(body, offset);
    if (result === null) {
      break;
    }
    entries.push(result.entry);
    offset = result.nextOffset;
  }

  return entries;
}
