import { bot } from './bot';
import { env } from '../env';
import { getInteractionWithContact } from '@/services/ContactService';
import { getProfile } from '@/services/UserProfileService';
import { buildCaption } from '@/services/CardService';

bot().on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query.trim();
  if (!query) {
    await ctx.answerInlineQuery([], { cache_time: 0 });
    return;
  }

  const found = await getInteractionWithContact(query);
  if (!found) {
    await ctx.answerInlineQuery([], { cache_time: 0 });
    return;
  }

  const { interaction, contact } = found;
  const profile = await getProfile(contact.userId);
  if (!profile) {
    await ctx.answerInlineQuery([], { cache_time: 0 });
    return;
  }

  const recap = (interaction.structuredData as { recap?: string } | null)?.recap ?? '';

  const caption = buildCaption({
    profile: {
      displayName: profile.displayName,
      tagline: profile.tagline,
      telegramUsername: profile.telegramUsername,
      socials: profile.socials,
    },
    contactName: contact.name,
    recap,
  });

  const photoUrl = `${env().R2_PUBLIC_URL_BASE}/cards/${interaction.id}.png`;

  await ctx.answerInlineQuery(
    [
      {
        type: 'photo',
        id: interaction.id,
        photo_url: photoUrl,
        thumbnail_url: photoUrl,
        photo_width: 1080,
        photo_height: 1920,
        title: `Card for ${contact.name}`,
        caption,
      },
    ],
    { cache_time: 0 }
  );
});
