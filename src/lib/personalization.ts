// Personalization helpers — vocabulary, corrections, and calibration examples
// folded into the per-capture prompt context. See
// docs/superpowers/specs/2026-06-24-personalization-design.md.

const MAX_VOCAB_CHARS = 500;
const MAX_CORRECTIONS_INJECTED = 10;
const MAX_EXAMPLES_INJECTED = 3;

export function normalizeVocabulary(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.length > MAX_VOCAB_CHARS ? trimmed.slice(0, MAX_VOCAB_CHARS) : trimmed;
}

// Whisper's initial_prompt biases transcription toward expected vocabulary.
// We frame it as if it's the tail of a conversation the speaker has been
// having, which matches OpenAI's recommended shape (continuation prompt).
export function buildWhisperInitialPrompt(vocabulary: string | null): string | undefined {
  if (!vocabulary) return undefined;
  const prompt = `Names and terms that may come up: ${vocabulary}.`;
  return prompt.length > MAX_VOCAB_CHARS ? prompt.slice(0, MAX_VOCAB_CHARS) : prompt;
}

export type CorrectionForPrompt = {
  field: string;
  originalText: string;
  correctedText: string;
};

export type ExampleForPrompt = {
  transcript: string;
  expectedJson: unknown;
};

export function buildExtractionPersonalizationBlock(input: {
  vocabulary: string | null;
  corrections: CorrectionForPrompt[];
  examples: ExampleForPrompt[];
}): string {
  const parts: string[] = [];

  if (input.vocabulary) {
    parts.push(
      `USER VOCABULARY (words this user says often — prefer these spellings):\n${input.vocabulary}`,
    );
  }

  if (input.corrections.length > 0) {
    const lines = input.corrections
      .slice(0, MAX_CORRECTIONS_INJECTED)
      .map((c) => `- ${c.field}: "${c.originalText}" → "${c.correctedText}"`);
    parts.push(
      `RECENT CORRECTIONS (when the user said the left, they meant the right — prefer the right):\n${lines.join('\n')}`,
    );
  }

  if (input.examples.length > 0) {
    const lines = input.examples
      .slice(0, MAX_EXAMPLES_INJECTED)
      .map((e) => `Transcript: ${JSON.stringify(e.transcript)}\nOutput: ${JSON.stringify(e.expectedJson)}`);
    parts.push(
      `USER EXAMPLES (when this user records, expect output like these):\n${lines.join('\n\n')}`,
    );
  }

  if (parts.length === 0) return '';
  return `\n\n${parts.join('\n\n')}`;
}
