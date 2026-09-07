import { parseDeviceListing } from './listing.ts';
import type { RecorderDevice, Recording } from './types.ts';

/**
 * fixtures からデバイスの応答を再生する実装。
 *
 * 実機が手元に無くても開発とテストを回せるようにするためのもの。
 * P1 は独自 USB プロトコルで、繋がないと一覧すら取れない。
 * それを開発ループに持ち込むと毎回人間の操作が挟まり、
 * このプロジェクトの原則（繰り返す工程に人手を挟まない）に反する。
 *
 * 音声本体は fixtures に含めない（リポジトリに音声を入れないため）。
 * `downloadRecording` に渡す中身は呼び出し側が指定する。
 */
export function createReplayDevice(
  rawListing: unknown,
  audioByName: ReadonlyMap<string, Uint8Array> = new Map(),
): RecorderDevice {
  const { recordings } = parseDeviceListing(rawListing);

  return {
    listRecordings(): Promise<readonly Recording[]> {
      return Promise.resolve(recordings);
    },

    downloadRecording(recording: Recording): Promise<Uint8Array> {
      const audio = audioByName.get(recording.name);
      if (audio === undefined) {
        return Promise.reject(
          new Error(`No replay audio available for: ${recording.name}`),
        );
      }
      return Promise.resolve(audio);
    },
  };
}
