import { bot } from './bot';
import { inngest } from '@/lib/inngest/client';
import { getByTelegramUserId } from '@/services/UserProfileService';

const MAX_BYTES = 20 * 1024 * 1024;

bot().on('voice', async (ctx) => {
  if ((ctx.message.voice.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  const profile = await getByTelegramUserId(ctx.from!.id);
  if (!profile) {
    await ctx.reply("Your profile isn't set up yet. Run /start first.");
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: profile.id,
      source: 'telegram-voice',
      audio: { kind: 'telegram-file', fileId: ctx.message.voice.file_id, mimeType: ctx.message.voice.mime_type ?? 'audio/ogg' },
      replyTo: { surface: 'telegram', chatId: ctx.chat.id },
    },
  });
});

bot().on('audio', async (ctx) => {
  if ((ctx.message.audio.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  const profile = await getByTelegramUserId(ctx.from!.id);
  if (!profile) {
    await ctx.reply("Your profile isn't set up yet. Run /start first.");
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: profile.id,
      source: 'telegram-audio',
      audio: { kind: 'telegram-file', fileId: ctx.message.audio.file_id, mimeType: ctx.message.audio.mime_type ?? 'audio/mpeg' },
      replyTo: { surface: 'telegram', chatId: ctx.chat.id },
    },
  });
});

bot().on('video', async (ctx) => {
  if ((ctx.message.video.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  const profile = await getByTelegramUserId(ctx.from!.id);
  if (!profile) {
    await ctx.reply("Your profile isn't set up yet. Run /start first.");
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: profile.id,
      source: 'telegram-video',
      audio: { kind: 'telegram-file', fileId: ctx.message.video.file_id, mimeType: ctx.message.video.mime_type ?? 'video/mp4' },
      replyTo: { surface: 'telegram', chatId: ctx.chat.id },
    },
  });
});
