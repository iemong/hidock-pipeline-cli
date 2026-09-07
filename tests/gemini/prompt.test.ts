import { describe, expect, it } from 'vitest';

import { buildMeetingPrompt } from '../../src/gemini/prompt.ts';

const AT = new Date(2026, 6, 13, 10, 31);

describe('buildMeetingPrompt', () => {
  it('録音日時を含める', () => {
    expect(buildMeetingPrompt({ recordedAt: AT })).toContain('2026-07-13 10:31');
  });

  it('話者を識別して同じラベルを使い続けるよう指示する', () => {
    const prompt = buildMeetingPrompt({ recordedAt: AT });
    expect(prompt).toContain('Identify speakers');
    expect(prompt).toContain('Keep the same label for the same speaker');
  });

  it('決定事項・未決・タスク候補・確認・発言録の5節を求める', () => {
    const prompt = buildMeetingPrompt({ recordedAt: AT });
    for (const section of [
      'Decisions',
      'Open questions',
      'Candidate implementation tasks',
      'Things to confirm',
      'Transcript',
    ]) {
      expect(prompt).toContain(section);
    }
  });

  it('断定させず候補として出させる（Vault の原則）', () => {
    expect(buildMeetingPrompt({ recordedAt: AT })).toContain(
      'Present these as candidates',
    );
  });

  it('推測で埋めないよう明示する', () => {
    const prompt = buildMeetingPrompt({ recordedAt: AT });
    expect(prompt).toContain('rather than guessing');
    expect(prompt).toContain("Do not add content that isn't in the audio");
  });

  it('繰り返しを禁じる（暴走時の症状に対する保険）', () => {
    expect(buildMeetingPrompt({ recordedAt: AT })).toContain(
      'Do not repeat the same content',
    );
  });

  it('語彙を渡すと一覧として埋め込む', () => {
    const prompt = buildMeetingPrompt({
      recordedAt: AT,
      vocabulary: ['custom-domain', 'マガジン'],
    });

    expect(prompt).toContain('## Vocabulary');
    expect(prompt).toContain('- custom-domain');
    expect(prompt).toContain('- マガジン');
  });

  it('語彙が無ければ語彙の節を出さない', () => {
    expect(buildMeetingPrompt({ recordedAt: AT })).not.toContain('## Vocabulary');
  });

  it('空配列でも語彙の節を出さない', () => {
    expect(buildMeetingPrompt({ recordedAt: AT, vocabulary: [] })).not.toContain(
      '## Vocabulary',
    );
  });
});
