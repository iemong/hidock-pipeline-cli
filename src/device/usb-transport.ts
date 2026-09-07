import { WebUSB } from 'usb';

import {
  buildPacket,
  type CommandId,
  HEADER_SIZE,
  parseResponseHeader,
} from './protocol.ts';
import { type ChunkReader, readBody } from './stream.ts';

/** 実機で確認した構成: interface 0 / OUT=1 / IN=2 (bulk 512) */
const VENDOR_ID = 0x10_d6;
const PRODUCT_ID = 0xb0_0e;
const INTERFACE = 0;
const ENDPOINT_OUT = 1;
const ENDPOINT_IN = 2;
/**
 * 1回の transferIn で要求するバイト数（エンドポイントの packet size 512 の倍数）。
 *
 * 8192 にすると 27MB の録音で 3400 回以上の転送が必要になり、
 * 途中で `transferIn error: Cancelled` になる。65536 なら同じ録音を
 * 429 回・3.6 秒で読み切れる（実機で確認）。
 */
const READ_CHUNK = 65_536;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  readonly body?: Uint8Array | undefined;
  readonly timeoutMs?: number | undefined;
  /**
   * 受け取るべき本体の長さ。
   * 転送コマンドでは応答ヘッダの bodyLength が全体長を表さないため、
   * 呼び出し側が知っているサイズを渡して終端を判定する。
   */
  readonly expectedBytes?: number | undefined;
}

export interface Transport {
  /** コマンドを送り、応答本体を受け取る */
  readonly request: (
    commandId: CommandId,
    options?: RequestOptions,
  ) => Promise<Uint8Array>;
  readonly close: () => Promise<void>;
}

export class DeviceNotFoundError extends Error {
  constructor() {
    super('HiDock P1 not found. Check that it is connected via USB-C.');
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceBusyError extends Error {
  constructor(cause: unknown) {
    super(
      'The P1 is in use by another process. Check that HiNotes or ' +
        'another import job is not already running.',
      { cause },
    );
    this.name = 'DeviceBusyError';
  }
}

/**
 * インターフェースの確保を待つ回数。
 *
 * USB インターフェースは排他で、直前のプロセスが手放すまで確保できない。
 * Raycast のように短時間に2回起動される環境では実際に衝突するため、
 * 少し待って再試行する。
 */
const CLAIM_ATTEMPTS = 5;
const CLAIM_RETRY_MS = 400;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function claimInterface(device: USBDevice): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CLAIM_ATTEMPTS; attempt += 1) {
    try {
      await device.claimInterface(INTERFACE);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < CLAIM_ATTEMPTS) {
        await wait(CLAIM_RETRY_MS);
      }
    }
  }

  throw new DeviceBusyError(lastError);
}

function toChunkReader(device: USBDevice): ChunkReader {
  return {
    read: async (): Promise<Uint8Array> => {
      const { data } = await device.transferIn(ENDPOINT_IN, READ_CHUNK);
      if (data === undefined) {
        return new Uint8Array(0);
      }
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    },
  };
}

async function claim(): Promise<USBDevice> {
  // WebUSB は W3C の USB を実装している。
  // usb パッケージ独自の UsbDevice 型ではなく標準の USBDevice で受けることで、
  // transferIn / transferOut が型として見えるようにする。
  const webusb: USB = new WebUSB({ allowAllDevices: true });
  const devices = await webusb.getDevices();
  const device = devices.find(
    (d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID,
  );

  if (device === undefined) {
    throw new DeviceNotFoundError();
  }

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await claimInterface(device);

  return device;
}

/**
 * 実機に接続した Transport を返す。
 *
 * このファイルは USB の I/O のみを担う。応答の組み立ては `stream.ts`、
 * パケットの解釈は `protocol.ts` にあり、どちらも実機なしで検証できる。
 */
export async function openTransport(): Promise<Transport> {
  const device = await claim();
  const reader = toChunkReader(device);
  let sequenceId = 0;

  return {
    request: async (commandId, options = {}) => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      sequenceId = (sequenceId + 1) >>> 0;
      await device.transferOut(
        ENDPOINT_OUT,
        buildPacket(commandId, sequenceId, options.body),
      );

      const deadline = Date.now() + timeoutMs;
      const head = await reader.read();
      const header = parseResponseHeader(head);
      if (header === null) {
        throw new Error(`Could not parse response header (${head.length} bytes)`);
      }

      return readBody({
        reader,
        first: head.subarray(HEADER_SIZE),
        bodyLength: options.expectedBytes ?? header.bodyLength,
        deadline,
      });
    },

    close: async (): Promise<void> => {
      await device.releaseInterface(INTERFACE);
      await device.close();
    },
  };
}
