import { env } from '../env';

export async function sendMessage(target: { chatId: number }, text: string): Promise<void> {
  const { TELEGRAM_BOT_TOKEN } = env();
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: target.chatId, text }),
  });
}

export async function sendPhoto(target: { chatId: number }, photo: Buffer, caption: string): Promise<void> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const form = new FormData();
  form.append('chat_id', String(target.chatId));
  form.append('caption', caption);
  form.append('photo', new Blob([photo as Uint8Array<ArrayBuffer>], { type: 'image/png' }), 'card.png');
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
}
