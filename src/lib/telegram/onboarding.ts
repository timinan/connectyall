import { Markup } from 'telegraf';
import { bot } from './bot';
import { getByTelegramUserId, upsertProfile, setSocial, setPhotoFromTelegram, getProfile } from '@/services/UserProfileService';
import type { Socials } from '@/lib/db/schema';

function socialsMenu(socials: Socials) {
  const mark = (k: keyof Socials) => (socials[k] ? '✓ ' : '+ ');
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${mark('x')}X`, 'add_x'), Markup.button.callback(`${mark('linkedin')}LinkedIn`, 'add_linkedin')],
    [Markup.button.callback(`${mark('email')}Email`, 'add_email'), Markup.button.callback(`${mark('website')}Website`, 'add_website')],
    [Markup.button.callback('Done', 'done_socials')],
  ]);
}

bot().start(async (ctx) => {
  const tgUser = ctx.from!;
  ctx.session.onboarding = { step: 'awaiting_name', partial: { displayName: tgUser.first_name } };

  await ctx.reply(
    `👋 Hey ${tgUser.first_name}, welcome to Connectyall.\n\n` +
      `I turn voice memos about people you've met into designed cards you can forward to them.\n\n` +
      `Let's set up your card. What name should appear on it?`,
    Markup.keyboard([[`Use "${tgUser.first_name}"`]]).oneTime().resize()
  );
});

bot().on('text', async (ctx, next) => {
  const state = ctx.session.onboarding;
  if (!state?.step) return next();
  const text = ctx.message.text.trim();

  if (state.step === 'awaiting_name') {
    const name = text.startsWith('Use "') ? state.partial?.displayName ?? text : text;
    await upsertProfile({
      telegramUserId: ctx.from!.id,
      telegramUsername: ctx.from!.username ?? null,
      displayName: name,
    });
    state.step = 'awaiting_photo';
    await ctx.reply('Got it. Now send me a photo, or tap Skip to use your Telegram avatar.',
      Markup.keyboard([['Skip']]).oneTime().resize());
    return;
  }

  if (state.step === 'awaiting_photo' && text === 'Skip') {
    state.step = 'awaiting_tagline';
    await ctx.reply('One-line tagline. What do you do? (e.g., "PM building crypto products")', Markup.removeKeyboard());
    return;
  }

  if (state.step === 'awaiting_tagline') {
    await upsertProfile({
      telegramUserId: ctx.from!.id,
      displayName: (await getProfile(ctx.from!.id))!.displayName,
      tagline: text,
    });
    state.step = 'awaiting_socials';
    const profile = await getProfile(ctx.from!.id);
    await ctx.reply('Add socials (optional). Tap each, or tap Done.', socialsMenu(profile?.socials ?? {}));
    return;
  }

  if (state.step === 'awaiting_socials' && state.partial?.tagline === 'pending_social') {
    const kind = state.partial.displayName as keyof Socials; // reused field
    const profileForSocial = await getByTelegramUserId(ctx.from!.id);
    if (!profileForSocial) return;
    await setSocial(profileForSocial.id, kind, text);
    state.partial = {};
    const profile = await getProfile(ctx.from!.id);
    await ctx.reply('Saved. Add more or tap Done.', socialsMenu(profile?.socials ?? {}));
    return;
  }
});

bot().on('photo', async (ctx) => {
  const state = ctx.session.onboarding;
  if (state?.step !== 'awaiting_photo') return;
  const profileForPhoto = await getByTelegramUserId(ctx.from!.id);
  if (!profileForPhoto) return;
  const photos = ctx.message.photo;
  const largest = photos[photos.length - 1];
  await setPhotoFromTelegram(profileForPhoto.id, largest.file_id);
  state.step = 'awaiting_tagline';
  await ctx.reply('Photo saved. One-line tagline. What do you do?', Markup.removeKeyboard());
});

const socialActions: Array<[string, keyof Socials]> = [
  ['add_x', 'x'], ['add_linkedin', 'linkedin'], ['add_email', 'email'], ['add_website', 'website'],
];

for (const [action, kind] of socialActions) {
  bot().action(action, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.onboarding = ctx.session.onboarding ?? {};
    ctx.session.onboarding.step = 'awaiting_socials';
    ctx.session.onboarding.partial = { displayName: kind, tagline: 'pending_social' }; // sentinel pack
    await ctx.reply(`Send your ${kind} handle.`);
  });
}

bot().action('done_socials', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.onboarding = {};
  await ctx.reply(
    `Done. Try it: record a voice memo about someone you recently met.\n\nI'll generate a card you can forward to them.`,
    Markup.removeKeyboard()
  );
});
