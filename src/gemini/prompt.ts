/**
 * Instructions for summarizing meeting audio.
 *
 * Carries forward one rule: AI output is a draft, never a definitive
 * record. Implementation tasks are proposed as candidates too — the
 * user makes the actual call.
 */

export interface PromptContext {
  /** Recording timestamp (for display) */
  readonly recordedAt: Date;
  /** Vocabulary hints to improve recognition of proper nouns */
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
      ? `\n## Vocabulary\nThe following proper nouns may appear. Use this exact spelling.\n${vocabulary.map((v) => `- ${v}`).join('\n')}\n`
      : '';

  return `This is a meeting recorded on ${formatDate(context.recordedAt)}.
Respond in English, and output only Markdown in the structure below. No preamble or closing remarks.
${vocabularySection}
## Output structure

### 1. Decisions
Only things definitively decided in the meeting. Do not include anything still undecided.

### 2. Open questions
Points that were discussed but not resolved. Note what the disagreement was, if any.

### 3. Candidate implementation tasks
Only if engineering work came up. Write with enough granularity and
dependency information to be actionable. Present these as candidates,
not confirmed tasks. If none, write "None".

### 4. Things to confirm
Points that couldn't be determined from the audio. Phrase these as
questions the user can answer briefly.

### 5. Transcript
Identify speakers with labels like "Speaker A:" and transcribe in
chronological order. Keep the same label for the same speaker
throughout. Mark inaudible segments as [inaudible] rather than guessing.

## Rules

- Always distinguish fact from inference; mark inferences explicitly (e.g. "likely ...")
- Do not add content that isn't in the audio
- Do not repeat the same content`;
}
