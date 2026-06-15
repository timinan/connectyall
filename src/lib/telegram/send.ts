import { env } from '../env';

type ReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
};

export async function sendMessage(
  target: { chatId: number },
  text: string,
  opts: { parseMode?: 'HTML' | 'MarkdownV2'; replyMarkup?: ReplyMarkup; disableWebPagePreview?: boolean } = {}
): Promise<void> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const body: Record<string, unknown> = { chat_id: target.chatId, text };
  if (opts.parseMode) body.parse_mode = opts.parseMode;
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  if (opts.disableWebPagePreview) body.disable_web_page_preview = true;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function sendPhoto(
  target: { chatId: number },
  photo: Buffer,
  caption: string,
  opts: { replyMarkup?: ReplyMarkup } = {}
): Promise<void> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const form = new FormData();
  form.append('chat_id', String(target.chatId));
  form.append('caption', caption);
  form.append('photo', new Blob([photo as Uint8Array<ArrayBuffer>], { type: 'image/png' }), 'card.png');
  if (opts.replyMarkup) form.append('reply_markup', JSON.stringify(opts.replyMarkup));
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
}
