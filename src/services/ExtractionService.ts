import { generateObject } from 'ai';
import { z } from 'zod';
import { getLLM } from '../lib/llm';

export const ContactSchema = z.object({
  name: z.string(),
  role: z.string().nullable(),
  company: z.string().nullable(),
  emails: z.array(z.string()),
  links: z.object({
    telegram: z.string().optional(),
    x: z.string().optional(),
    linkedin: z.string().optional(),
    website: z.string().optional(),
  }),
  context: z.string(),
  recap: z.string(),
  user_commitments: z.array(z.string()),
  their_commitments: z.array(z.string()),
});

export const ExtractionSchema = z.object({
  contacts: z.array(ContactSchema),
  was_live_recording: z.boolean(),
});

export type ExtractedContact = z.infer<typeof ContactSchema>;
export type ExtractionResult = z.infer<typeof ExtractionSchema>;

const SYSTEM_PROMPT = `You extract contact information from voice memos people record after meeting someone. Return strict JSON matching the provided schema.

Rules:
- Each person mentioned becomes one entry in "contacts".
- "context" is one sentence about where/how they met. "recap" is 1-2 sentences about what was discussed.
- "user_commitments" = what the speaker promised. "their_commitments" = what the other person promised.
- For "links": if a Telegram handle is mentioned ("she's @sarahcc on Telegram"), put it under links.telegram. Same for x / linkedin. Strip "@" and URLs to just handles.
- "was_live_recording" is true if the audio clearly contains the contact's own voice in the recording (a live conversation), false if it's just the user speaking notes after the fact.
- If you cannot identify a person, return an empty contacts array.`;

export async function extract(input: {
  transcript: string;
  selfIntro?: string | null;
}): Promise<ExtractionResult> {
  const userContext = input.selfIntro ? `About the speaker: ${input.selfIntro}\n\n` : '';
  const result = await generateObject({
    model: getLLM(),
    system: SYSTEM_PROMPT,
    prompt: `${userContext}Transcript:\n${input.transcript}`,
    schema: ExtractionSchema,
  });
  return result.object;
}
