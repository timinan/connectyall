import { bot } from './bot';
import { consumeLinkToken } from '@/services/TelegramLinkService';

bot().start(async (ctx, next) => {
  const payload = (ctx.message?.text ?? '').replace(/^\/start\s*/, '').trim();
  if (payload.startsWith('link_')) {
    const token = payload.slice('link_'.length);
    const ok = await consumeLinkToken(token, ctx.from!.id, ctx.from!.username ?? null);
    if (ok) {
      await ctx.reply('✅ Linked. Your bot account and web account share the same CRM now.');
    } else {
      await ctx.reply('That link expired or is invalid. Try generating a new one in the web app.');
    }
    return;
  }
  return next();
});
