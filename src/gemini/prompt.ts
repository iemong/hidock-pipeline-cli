/**
 * 会議音声に対する指示。
 *
 * 「AI は断定的に書かず候補を出す」という Vault 側の原則をそのまま持ち込む。
 * 実装計画も確定物ではなく候補として出させ、判断はユーザーに残す。
 */

export interface PromptContext {
  /** 録音日時（表示用） */
  readonly recordedAt: Date;
  /** 固有名詞の認識精度を上げるための語彙 */
  readonly vocabulary?: readonly string[] | undefined;
}

function formatDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function buildMeetingPrompt(context: PromptContext): string {
  const vocabulary = context.vocabulary ?? [];
  const vocabularySection =
    vocabulary.length > 0
      ? `\n## 語彙\n次の固有名詞が登場する可能性がある。表記を合わせること。\n${vocabulary.map((v) => `- ${v}`).join('\n')}\n`
      : '';

  return `これは ${formatDate(context.recordedAt)} に録音された会議です。
日本語で処理し、以下の構成の Markdown だけを出力してください。前置きや後書きは不要です。
${vocabularySection}
## 出力構成

### 1. 決定事項
会議で確実に決まったことのみ。決まっていないことは書かない。

### 2. 未決の論点
議論されたが結論が出ていないこと。何が対立点だったかも書く。

### 3. 実装タスク候補
エンジニアリング作業が発生する場合のみ。粒度と依存関係がわかるように書く。
確定したタスクとして書かず、候補として提示すること。
該当が無ければ「なし」とだけ書く。

### 4. 確認したいこと
音声からは判断できなかった点。ユーザーが短く答えられる形の質問にする。

### 5. 発言録
話者を識別し「話者A:」のようなラベルを付けて時系列で書き起こす。
同じ話者には最後まで同じラベルを使うこと。
聞き取れない箇所は [不明] と書き、推測で埋めないこと。

## 守ること

- 事実と推測を必ず区別する。推測には「〜と思われる」と明示する
- 音声に無い内容を補わない
- 同じ内容を繰り返さない`;
}
