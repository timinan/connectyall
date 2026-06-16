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
- "context" is one sentence about where/how they met.
- "user_commitments" = what the speaker promised. "their_commitments" = what the other person promised.
- "was_live_recording" is true if the audio clearly contains the contact's own voice in the recording (a live conversation), false if it's just the user speaking notes after the fact.
- If you cannot identify a person, return an empty contacts array.

RECAP RULES (be strict — the recap is shown directly to the recipient in the share preview, so it must read like a clean takeaway, not a stream of notes):

The "recap" is a complete sentence describing the SUBSTANCE of the conversation. Strip conversational framing — keep only the topic itself.

Drop these opening phrases when they appear at the start of the recap:
- "We talked about", "We discussed", "We touched on", "We chatted about"
- "She mentioned", "He mentioned", "They mentioned"
- "I asked her about", "I asked him about", "She told me", "He told me"
- "We covered", "We went over", "We got into"

Examples (input → recap):
- "We talked about how USDC could replace bank rails." → "USDC could replace bank rails."
- "We discussed her startup's pivot from B2B to consumer." → "Her startup's pivot from B2B to consumer."
- "She mentioned she's hiring senior backend engineers next quarter." → "She's hiring senior backend engineers next quarter."
- "I asked her about her PhD research on protein folding." → "Her PhD research on protein folding."
- "We covered the Series B he's raising and his go-to-market plan." → "His Series B raise and go-to-market plan."

Keep the recap to ONE sentence when possible, two MAX. If multiple topics were discussed, combine into one clean sentence rather than enumerating.

If the original phrasing already has no leading filler, leave it alone — do not paraphrase aggressively just for the sake of it.

LINKS EXTRACTION (be aggressive about this — these are the most valuable field):

The "links" object captures the CONTACT'S social handles (not the speaker's). Look hard for any handle, username, or URL mentioned for each person. Strip "@" prefixes and URL prefixes — store ONLY the bare handle.

Telegram (links.telegram):
- "her Telegram is @sarahchen" → "sarahchen"
- "he's @bobsmith on Telegram" → "bobsmith"
- "Telegram handle is alice_wu" → "alice_wu"
- "find him at t.me/mike99" → "mike99"
- "her TG is @julia" → "julia"
- "his telegram id is michelle" → "michelle"
- "ID michelle on Telegram" → "michelle"
- ANY mention of a Telegram handle, username, ID, TG, or t.me link → extract it

X / Twitter (links.x):
- "x.com/sarahc" → "sarahc"
- "@sarahchen on Twitter" → "sarahchen"
- "her X handle is sarahc" → "sarahc"

LinkedIn (links.linkedin):
- "linkedin.com/in/sarah-chen" → "sarah-chen"
- "her LinkedIn is sarah chen" → "sarah-chen"

Website (links.website):
- "her site is sarahchen.com" → "sarahchen.com"
- Bare domains stay as-is

Email goes in "emails" array. Phone numbers go in "context" as plain text.

If a handle is mentioned, you MUST include it. Do not omit because the spelling is uncertain — best-effort transcription of the handle is required.`;

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
