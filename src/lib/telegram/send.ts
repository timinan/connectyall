import { env } from '../env';

type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string }
  | {
      text: string;
      switch_inline_query_chosen_chat: {
        query: string;
        allow_user_chats?: boolean;
        allow_bot_chats?: boolean;
        allow_group_chats?: boolean;
        allow_channel_chats?: boolean;
      };
    };

type ReplyMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
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
): Promise<{ photoFileId: string | null }> {
  const { TELEGRAM_BOT_TOKEN } = env();
  const form = new FormData();
  form.append('chat_id', String(target.chatId));
  form.append('caption', caption);
  form.append('photo', new Blob([photo as Uint8Array<ArrayBuffer>], { type: 'image/png' }), 'card.png');
  if (opts.replyMarkup) form.append('reply_markup', JSON.stringify(opts.replyMarkup));
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: { photo?: Array<{ file_id: string; width?: number; height?: number }> } }
    | null;
  const sizes = json?.result?.photo ?? [];
  const largest = sizes.length
    ? sizes.reduce((a, b) => ((b.width ?? 0) > (a.width ?? 0) ? b : a))
    : null;
  return { photoFileId: largest?.file_id ?? null };
}
