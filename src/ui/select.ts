import { formatDuration } from '../audio/probe.ts';
import type { Recording } from '../device/types.ts';
import type { CommandRunner } from '../exec.ts';

/**
 * 取り込む録音を選ばせるダイアログ。
 *
 * 選ぶ工程が重いと結局使われなくなるため、判断に必要な情報
 * （いつ・どれだけ・いくら）を1行に収め、記憶に頼らせない。
 */

const HDA_EXTENSION = /\.hda$/i;
const NEEDS_ESCAPE = /["\\]/g;

/** 音声は 96kbps。バイト数から実際の長さを見積もる */
const BYTES_PER_SECOND = 12_000;
/** Gemini の音声トークンは約 25 tok/秒、Standard は $1.5/1M */
const USD_PER_SECOND = (25 * 1.5) / 1_000_000;

export function estimateSeconds(sizeBytes: number): number {
  return sizeBytes / BYTES_PER_SECOND;
}

export function estimateUsd(sizeBytes: number): number {
  return estimateSeconds(sizeBytes) * USD_PER_SECOND;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 例: 07/27 20:59  39分  $0.14  Rec13 */
export function describeChoice(recording: Recording): string {
  const at = recording.recordedAt;
  const when = `${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const length = formatDuration(estimateSeconds(recording.sizeBytes));
  const cost = `$${estimateUsd(recording.sizeBytes).toFixed(2)}`;
  const label = recording.name.replace(HDA_EXTENSION, '').split('-').pop() ?? '';

  return `${when}  ${length}  ${cost}  ${label}`;
}

function escapeForAppleScript(text: string): string {
  return text.replace(NEEDS_ESCAPE, '\\$&');
}

function buildScript(choices: readonly string[], prompt: string): string {
  const list = choices.map((c) => `"${escapeForAppleScript(c)}"`).join(', ');
  return (
    `set chosen to choose from list {${list}} ` +
    `with title "HiDock" with prompt "${escapeForAppleScript(prompt)}" ` +
    'with multiple selections allowed\n' +
    'if chosen is false then\n' +
    '  return ""\n' +
    'end if\n' +
    "set AppleScript's text item delimiters to linefeed\n" +
    'return chosen as text'
  );
}

/**
 * 未処理の録音を提示し、選ばれたものを返す。
 *
 * キャンセルされた場合は空配列。何も選ばなかったのと同じ扱いにし、
 * 「選ばなかった」ことを失敗として扱わない。
 */
export async function chooseRecordings(
  runner: CommandRunner,
  candidates: readonly Recording[],
): Promise<readonly Recording[]> {
  if (candidates.length === 0) {
    return [];
  }

  const byLabel = new Map(candidates.map((r) => [describeChoice(r), r]));
  const prompt = `取り込む会議を選んでください（${candidates.length}件）`;

  const { stdout } = await runner.run('osascript', [
    '-e',
    buildScript([...byLabel.keys()], prompt),
  ]);

  return stdout
    .split('\n')
    .map((line) => byLabel.get(line.trim()))
    .filter((r): r is Recording => r !== undefined);
}
