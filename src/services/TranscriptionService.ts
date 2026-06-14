import { env } from '../lib/env';

export async function transcribe(audio: Uint8Array): Promise<string> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = env();
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/octet-stream',
    },
    body: audio,
  });
  const json = (await res.json()) as {
    success: boolean;
    result?: { text: string };
    errors?: Array<{ message: string }>;
  };
  if (!json.success) {
    const reason = json.errors?.[0]?.message ?? 'unknown error';
    throw new Error(`Whisper transcription failed: ${reason}`);
  }
  return json.result?.text ?? '';
}
