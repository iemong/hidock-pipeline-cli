/**
 * 応答の分割受信を組み立てる部分。
 *
 * USB の I/O からは切り離してある。ここが純粋であれば、
 * 「途中で切れた」「余分に届いた」といった挙動を実機なしで検証できる。
 */

export interface ChunkReader {
  readonly read: () => Promise<Uint8Array>;
}

export class IncompleteResponseError extends Error {
  readonly received: number;
  readonly expected: number;

  constructor(received: number, expected: number) {
    super(`応答が時間内に完了しなかった (${received}/${expected} bytes)`);
    this.name = 'IncompleteResponseError';
    this.received = received;
    this.expected = expected;
  }
}

export interface ReadBodyOptions {
  readonly reader: ChunkReader;
  /** ヘッダを取り除いた最初のチャンク */
  readonly first: Uint8Array;
  readonly bodyLength: number;
  /** 打ち切り時刻（epoch ms） */
  readonly deadline: number;
  /** テストから時刻を差し替えるための口 */
  readonly now?: () => number;
}

/** チャンク列を結合し、指定長に切り詰める */
export function concat(chunks: readonly Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    const room = totalLength - offset;
    if (room <= 0) {
      break;
    }
    out.set(chunk.subarray(0, Math.min(chunk.length, room)), offset);
    offset += chunk.length;
  }

  return out;
}

/**
 * 本体が `bodyLength` に達するまで読み集める。
 *
 * デバイスが送信を止めた場合（空チャンク）は、そこまでの内容を返す。
 * 呼び出し側が長さを検査できるよう、黙って埋めることはしない。
 */
export async function readBody(options: ReadBodyOptions): Promise<Uint8Array> {
  const { reader, first, bodyLength, deadline, now = Date.now } = options;
  const chunks: Uint8Array[] = [first];
  let received = first.length;

  while (received < bodyLength) {
    if (now() > deadline) {
      throw new IncompleteResponseError(received, bodyLength);
    }
    const chunk = await reader.read();
    if (chunk.length === 0) {
      break;
    }
    chunks.push(chunk);
    received += chunk.length;
  }

  return concat(chunks, Math.min(received, bodyLength));
}
