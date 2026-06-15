import { bot } from './bot';
import { getInteractionWithContact, setContactLink } from '@/services/ContactService';

const FIX_PREFIX = 'fix:';
const HANDLE_RE = /^[a-zA-Z0-9_]{3,32}$/;

bot().on('callback_query', async (ctx, next) => {
  const data = (ctx.callbackQuery as { data?: string }).data;
  if (!data || !data.startsWith(FIX_PREFIX)) return next();

  const interactionId = data.slice(FIX_PREFIX.length);
  if (!interactionId) {
    await ctx.answerCbQuery('Bad button data');
    return;
  }

  const found = await getInteractionWithContact(interactionId);
  if (!found) {
    await ctx.answerCbQuery('Card not found');
    return;
  }

  ctx.session.fixingHandle = {
    contactId: found.contact.id,
    contactName: found.contact.name,
    interactionId,
  };
  await ctx.answerCbQuery();
  await ctx.reply(
    `What's the correct Telegram handle for ${found.contact.name}? Send it as plain text (with or without @). Send "cancel" to abort.`
  );
});

bot().on('text', async (ctx, next) => {
  const state = ctx.session.fixingHandle;
  if (!state) return next();

  const raw = ctx.message.text.trim();

  if (raw.toLowerCase() === 'cancel') {
    ctx.session.fixingHandle = undefined;
    await ctx.reply('Cancelled.');
    return;
  }

  const handle = raw
    .replace(/^@/, '')
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '');

  if (!HANDLE_RE.test(handle)) {
    await ctx.reply(`That doesn't look like a Telegram handle. Try again or send "cancel".`);
    return;
  }

  await setContactLink(state.contactId, 'telegram', handle);
  const { interactionId, contactName } = state;
  ctx.session.fixingHandle = undefined;

  await ctx.reply(`✅ Updated. Forward to @${handle} 👇`, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `📨 Send to @${handle}`,
            switch_inline_query_chosen_chat: { query: interactionId, allow_user_chats: true },
          },
        ],
        [{ text: `Open chat with @${handle}`, url: `https://t.me/${handle}` }],
        [{ text: `✏️ Fix again for ${contactName}`, callback_data: `${FIX_PREFIX}${interactionId}` }],
      ],
    },
  });
});
