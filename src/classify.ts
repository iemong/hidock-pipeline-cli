/**
 * 録音の種別判定。
 *
 * P1 のファイル名は日時と録音モードだけで構成されており、
 * 会議名や相手の情報を含まない。実機で確認した形式は次の通り。
 *
 *   2026Jul13-103142-Rec03.hda
 *   2026Jul13-200404-Wip01.hda
 *
 * `Rec` が通常録音（会議）、`Wip` はそれ以外の短い録音。
 * ユーザーの運用上 Rec のみをパイプラインに乗せる。
 *
 * 判定できなかったものは `unknown` とし、処理対象から外す。
 * 「判定に失敗したら処理しない」方向に倒すことで、
 * 想定外のファイルが外部サービスへ送られないようにしている。
 */

/** 録音日時と種別。ファイル名から読み取れる情報のすべて。 */
export interface ParsedRecording {
  readonly kind: RecordingKind;
  /** ローカル時刻。タイムゾーン情報はファイル名に含まれないため実機のローカル時刻として扱う */
  readonly recordedAt: Date;
  /** 同一モード内の連番 */
  readonly sequence: number;
}

export type RecordingKind = 'meeting' | 'whisper' | 'unknown';

/** 例: 2026Jul13-103142-Rec03.hda */
const FILENAME_PATTERN =
  /^(?<year>\d{4})(?<month>[A-Za-z]{3})(?<day>\d{2})-(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})-(?<mode>[A-Za-z]+)(?<seq>\d+)\.hda$/;

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

const MODE_TO_KIND: Readonly<Record<string, RecordingKind>> = {
  rec: 'meeting',
  wip: 'whisper',
};

/**
 * ファイル名から録音種別を判定する。
 *
 * 音声の中身は見ない。中身を見る時点で外部送信が必要になり、
 * 送ってよいかを判定するという目的と矛盾するため。
 */
export function classifyRecording(fileName: string): RecordingKind {
  const parsed = parseRecording(fileName);
  return parsed === null ? 'unknown' : parsed.kind;
}

/**
 * ファイル名を解析して種別と録音日時を取り出す。
 * 形式に合わない場合は null を返す。
 */
export function parseRecording(fileName: string): ParsedRecording | null {
  const groups = FILENAME_PATTERN.exec(fileName.trim())?.groups;
  if (!groups) {
    return null;
  }

  const monthIndex = MONTHS.indexOf(
    groups['month']?.toLowerCase() as (typeof MONTHS)[number],
  );
  if (monthIndex < 0) {
    return null;
  }

  const recordedAt = new Date(
    Number(groups['year']),
    monthIndex,
    Number(groups['day']),
    Number(groups['hour']),
    Number(groups['minute']),
    Number(groups['second']),
  );
  if (Number.isNaN(recordedAt.getTime())) {
    return null;
  }

  return {
    kind: MODE_TO_KIND[groups['mode']?.toLowerCase() ?? ''] ?? 'unknown',
    recordedAt,
    sequence: Number(groups['seq']),
  };
}

/**
 * その録音をパイプラインで処理してよいかを返す。
 * 会議（Rec）のみが対象。
 */
export function isPipelineEligible(kind: RecordingKind): boolean {
  return kind === 'meeting';
}

/**
 * 除外理由を人間が読める形で返す。処理対象の場合は null。
 * 通知やログで「なぜ処理されなかったか」を示すために使う。
 */
export function explainExclusion(kind: RecordingKind): string | null {
  switch (kind) {
    case 'meeting': {
      return null;
    }
    case 'whisper': {
      return 'Wip（短時間録音）はパイプライン対象外';
    }
    case 'unknown': {
      return 'ファイル名が既知の形式に合わないため、安全側に倒して除外';
    }
  }
}
