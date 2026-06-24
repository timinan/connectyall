import { generateObject } from 'ai';
import { z } from 'zod';
import { getLLM } from '../lib/llm';
import { withRetry } from '../lib/retry';
import {
  buildExtractionPersonalizationBlock,
  type CorrectionForPrompt,
  type ExampleForPrompt,
} from '../lib/personalization';

export const ContactSchema = z.object({
  name: z.string(),
  role: z.string().nullable(),
  company: z.string().nullable(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  preferred_channel: z.enum(['telegram', 'email', 'phone', 'x', 'linkedin', 'website', 'whatsapp', 'wechat', 'line']).nullable(),
  links: z.object({
    telegram: z.string().optional(),
    x: z.string().optional(),
    linkedin: z.string().optional(),
    website: z.string().optional(),
    whatsapp: z.string().optional(),
    wechat: z.string().optional(),
    line: z.string().optional(),
  }),
  notes: z.string().nullable(),
  context: z.string(),
  recap: z.string(),
  user_commitments: z.array(z.string()),
  their_commitments: z.array(z.string()),
  // Permissive: passthrough unknown fields on each follow-up, and catch any
  // parse failure on the whole field by defaulting to [] instead of throwing
  // out the entire extraction. Gemini's structured-output adherence isn't 100%,
  // and one malformed follow-up shouldn't lose the whole contact + recap.
  follow_ups: z
    .array(
      z.object({
        topic: z.string(),
        relative_due: z.string().nullable().optional(),
      }).passthrough(),
    )
    .optional()
    .default([])
    .catch((ctx) => {
      // Detect Gemini structured-output drift in production. Each fired log line
      // = one capture where follow_ups had a malformed shape and we silently
      // recovered to []. Grep `[extraction] follow_ups drift` in Vercel logs to
      // measure drift rate over time.
      const fields = ctx.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .join('; ');
      console.warn(`[extraction] follow_ups drift recovered to [] — ${fields}`);
      return [];
    }),
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

RECAP RULES (be strict — the recap is dropped INTO this sentence template before it's shown to the contact:

  "Hey {first_name}, it was great meeting and chatting about {RECAP} with you!"

So the recap MUST grammatically fit between "chatting about" and "with you". That means a noun phrase — not a full sentence with its own subject and verb. Test it: read it back in the template and it should sound like one natural English sentence.

CONCRETE RULES:
- Output a noun phrase, not a sentence.
- Lowercase the first word UNLESS it's a proper noun (people, companies, products, acronyms — USDC, Google, Series B, San Francisco all stay capitalized).
- No trailing period, exclamation, or question mark.
- One short phrase (8-15 words is the sweet spot). If multiple topics, fold them into one phrase with "and".
- Lead with the contact's own possessive ("her", "his", "their") when the topic is something the contact owns / is doing — it slots in cleanly.

Examples (input → recap → sentence preview):
- "We talked about how USDC could replace bank rails." → "USDC potentially replacing bank rails" → "...chatting about USDC potentially replacing bank rails with you!"
- "We discussed her startup's pivot from B2B to consumer." → "her startup's pivot from B2B to consumer" → "...chatting about her startup's pivot from B2B to consumer with you!"
- "She mentioned she's hiring senior backend engineers next quarter." → "her backend hiring plans for next quarter" → "...chatting about her backend hiring plans for next quarter with you!"
- "I asked her about her PhD research on protein folding." → "her PhD research on protein folding" → "...chatting about her PhD research on protein folding with you!"
- "We covered the Series B he's raising and his go-to-market plan." → "his Series B raise and go-to-market plan" → "...chatting about his Series B raise and go-to-market plan with you!"
- "He told me about a side project he's building with Rust and AI agents." → "his side project building with Rust and AI agents" → "...chatting about his side project building with Rust and AI agents with you!"
- "We talked about Hong Kong's startup scene." → "Hong Kong's startup scene" → "...chatting about Hong Kong's startup scene with you!"

ANTI-EXAMPLES (don't do these):
- ❌ "She's hiring senior backend engineers next quarter." — full sentence, doesn't fit the template
- ❌ "We talked about her PhD research." — leading filler
- ❌ "Her PhD research on protein folding." — trailing period
- ❌ "The conversation covered her startup pivot." — meta-narration

If the original phrasing already reads as a clean noun phrase, leave it alone — don't paraphrase aggressively just for the sake of it.

FOLLOW-UPS EXTRACTION (the "follow_ups" field per contact):

Capture concrete commitments THE SPEAKER made about future actions toward this contact. Each follow_up has:
  - topic: a short phrase describing what they said they'd do, in the speaker's framing
  - relative_due: a relative-date phrase as spoken ("tomorrow", "in 3 days", "next week", "by Friday"), or null if no time was mentioned

Examples:
- "Need to follow up with her in 3 days about the role"
  → { "topic": "the role", "relative_due": "in 3 days" }
- "Send her the deck tomorrow"
  → { "topic": "send her the deck", "relative_due": "tomorrow" }
- "I should circle back eventually"
  → { "topic": "circle back", "relative_due": null }
- "Let me intro him to my designer friend next week"
  → { "topic": "intro him to my designer friend", "relative_due": "next week" }

DO NOT include commitments the OTHER person made:
- "She'll send me the deck" → NOT a follow-up (that's her commitment, goes in their_commitments)
- "He's going to share the doc" → NOT a follow-up

Keep topics short — 3 to 8 words is the sweet spot. They render in a tight UI row.

If no follow-ups were mentioned, return an empty array.

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

Email goes in "emails" array.

If a handle is mentioned, you MUST include it. Do not omit because the spelling is uncertain — best-effort transcription of the handle is required.

PHONE EXTRACTION (phones is a top-level array):

- "her number is 555-1234" → phones: ["555-1234"]
- "she gave me her cell, +1 415 555 9999" → phones: ["+14155559999"]
- "call him at 6 5 5 5 1 2 3 4" → phones: ["6555 1234"]
- Normalize obvious patterns; preserve digits, "+", spaces, parens, dashes as-is otherwise

SPELL-OUTS — when the speaker spells something letter-by-letter or digit-by-digit:

- "his email is S dash A dash R dash A dash H at gmail dot com" → "sarah@gmail.com"
- "her handle is S, O, S, H, A" → "sosha"
- "phone is 4 1 5 5 5 5 1 2 3 4" → "4155551234"
- "his linkedin is sarah dash chen" → "sarah-chen"
- "her email is t dot nan at gmail" → "t.nan@gmail.com"

The words "dot", "dash", "underscore", and "at" map to literal punctuation/symbols. Concatenate spelled-out characters with no spaces between them. Always favor a spelled-out version over an ambiguous earlier reference — the speaker is spelling because they want to be precise.

CORRECTIONS — when the speaker gives a value then changes it:

- "her email is sarah@gmail.com... actually it's sarah@acme.com" → "sarah@acme.com"
- "his number is 555-1234, no wait, 555-5678" → "555-5678"
- "her handle is @sarahc... I mean @sarah_c" → "@sarah_c"
- "his name is John, sorry Jonathan" → "Jonathan"

Cues that signal a correction: "actually", "I mean", "wait", "nevermind", "scratch that", "sorry", "no it's", "no wait". When you see one of these between two values for the SAME field, USE THE SECOND VALUE and discard the first. Don't include both. Don't combine them.

If the correction is about WHICH FIELD a value belongs to:
- "her email is sarah@gmail.com, oh wait that's her work — her personal is sarah@me.com" → emails: ["sarah@me.com"] (the corrected/personal one)

NOTES vs RECAP — IMPORTANT distinction:

"notes" = WHO THIS PERSON IS. Biographical / contextual facts that persist
across meetings. STAYS PRIVATE — never shared with the contact. One short
sentence. Examples:
- "Product manager at Meta"
- "Works at a nonprofit for Jesus"
- "Recently moved from SF to Berlin"
- "Friend of Sarah's from college"

"recap" = WHAT YOU TALKED ABOUT in THIS conversation. Per-meeting. Goes
INTO the share preview, so the contact will see this. One sentence,
substance-only (no "we talked about" framing — see existing rules).

Rules for distinguishing:
- "She's a PM at Meta"          → notes: "PM at Meta"     | recap: null (or whatever else was discussed)
- "We chatted about her PM role at Meta" → recap: "Her PM role at Meta"  | notes: null (unless something biographical was also said)
- "He's working at a nonprofit and we discussed his fundraising plans" → notes: "Working at a nonprofit"  | recap: "His fundraising plans"

If only biographical info was given, recap should be the most generic available
("our meeting", or null). If only conversational topics were discussed, notes
should be null.

ADDITIONAL MESSAGING CHANNELS — WhatsApp, WeChat, Line:

WhatsApp (links.whatsapp):
- "her WhatsApp is +1 415 555 1234" → "14155551234"
- "WhatsApp him at 555-1234" → "5551234"
- "he uses WhatsApp" (no number) → DON'T set
- Strip non-digits; preserve country code if mentioned
- If she mentions her WhatsApp AND a regular phone number, they're often the same — set both

WeChat (links.wechat):
- "her WeChat ID is sarah_chen_88" → "sarah_chen_88"
- "ping her on WeChat" (no ID) → DON'T set
- WeChat IDs are usually alphanumeric with underscores

Line (links.line):
- "find him on Line at @timmy" → "timmy"
- "his Line ID is timmy_jp" → "timmy_jp"
- Strip leading ~ or @ if present

PREFERRED CHANNEL (preferred_channel field, one of: telegram | email | phone | x | linkedin | website | whatsapp | wechat | line | null):

Detect EXPLICIT preference signals first:
- "email is best", "she said to email her", "best to reach via email" → "email"
- "text her", "her cell is the best way", "give her a call" → "phone"
- "DM her on twitter", "X is best" → "x"
- "she's most active on linkedin" → "linkedin"
- "telegram is the fastest", "ping her on tg" → "telegram"
- "best to reach via WhatsApp", "she always replies on WhatsApp" → "whatsapp"
- "WeChat is the only way to find her in China" → "wechat"
- "he's most active on Line" → "line"

If no explicit preference but ONLY ONE channel was mentioned, mark that as preferred (inferred).
If multiple channels mentioned with no preference signal, return null.
If no contact channels were mentioned at all, return null.`;

// Normalize: some LLMs return the literal string "null" or "None" for missing fields
const NULLISH = new Set(['null', 'none', 'n/a', 'undefined', '']);

function normalizeContacts(contacts: ExtractedContact[]): ExtractedContact[] {
  for (const c of contacts) {
    if (c.role && NULLISH.has(c.role.toLowerCase())) c.role = null;
    if (c.company && NULLISH.has(c.company.toLowerCase())) c.company = null;
    if (c.notes && NULLISH.has(c.notes.toLowerCase())) c.notes = null;
    if (c.recap && NULLISH.has(c.recap.toLowerCase())) c.recap = '';
    if (!c.follow_ups) c.follow_ups = [];
  }
  return contacts;
}

export async function extract(input: {
  transcript: string;
  selfIntro?: string | null;
  vocabulary?: string | null;
  corrections?: CorrectionForPrompt[];
  examples?: ExampleForPrompt[];
}): Promise<ExtractionResult> {
  const userContext = input.selfIntro ? `About the speaker: ${input.selfIntro}\n\n` : '';
  const personalization = buildExtractionPersonalizationBlock({
    vocabulary: input.vocabulary ?? null,
    corrections: input.corrections ?? [],
    examples: input.examples ?? [],
  });
  const result = await withRetry(
    () => generateObject({
      model: getLLM(),
      schema: ExtractionSchema,
      system: `${SYSTEM_PROMPT}${personalization}`,
      prompt: `${userContext}Transcript:\n${input.transcript}`,
    }),
    {
      maxAttempts: 3, // 1 try + 2 retries
      baseDelayMs: 1000,
      shouldRetry: (err) => {
        const status = (err as { statusCode?: number; status?: number })?.statusCode
          ?? (err as { status?: number })?.status;
        if (typeof status !== 'number') return false;
        if (status >= 500) return true; // transient upstream
        if (status === 429) return true; // retryable rate limit
        return false;
      },
    },
  );
  // Normalize string "null"/"none"/etc. to actual null for nullable fields
  normalizeContacts(result.object.contacts);
  return result.object;
}
