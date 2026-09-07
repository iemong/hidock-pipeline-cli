import type { RecordingKind } from '../classify.ts';

/**
 * デバイス上の録音1件。
 *
 * デバイスが報告する duration は意図的に持たない。
 * 上流の計算式が 24kbps 固定であり P1 (96kbps) では実際の4倍になるため、
 * 長さが必要な場面では ffprobe に問い合わせる。
 */
export interface Recording {
  readonly name: string;
  readonly sizeBytes: number;
  readonly recordedAt: Date;
  readonly kind: RecordingKind;
  /** デバイスが返す MD5。取り込み済み判定のキーに使う */
  readonly signature: string;
}

/**
 * 録音デバイスに対する最小の操作。
 *
 * 上流の `IDeviceInterface` は20以上のメソッドを持つが、
 * このパイプラインに必要なのは一覧と取得だけなので切り詰めている。
 *
 * `delete` と `format` は**意図的に定義しない**。
 * 呼ばないよう気をつけるのではなく、呼ぶ手段を与えないことで事故を防ぐ。
 */
export interface RecorderDevice {
  readonly listRecordings: () => Promise<readonly Recording[]>;
  /**
   * 録音を取得する。
   *
   * 名前ではなく Recording を受け取るのは、転送の終端判定に
   * デバイスが申告したサイズが必要なため。転送応答のヘッダに入る
   * bodyLength は最初のパケット分しか表さず、これだけで打ち切ると
   * ファイルの先頭しか取れない（実機で確認済み）。
   */
  readonly downloadRecording: (recording: Recording) => Promise<Uint8Array>;
}

/**
 * 一覧の解析結果。
 *
 * 解析できなかった要素は黙って捨てず `skipped` に理由を残す。
 * 取りこぼしが静かに起きると「全部処理された」と誤解するため。
 */
export interface ListingParseResult {
  readonly recordings: readonly Recording[];
  readonly skipped: readonly string[];
}
