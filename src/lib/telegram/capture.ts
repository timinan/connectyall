import { bot } from './bot';
import { inngest } from '@/lib/inngest/client';

const MAX_BYTES = 20 * 1024 * 1024;

bot().on('voice', async (ctx) => {
  if ((ctx.message.voice.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: ctx.from!.id,
      chatId: ctx.chat.id,
      fileId: ctx.message.voice.file_id,
      mimeType: ctx.message.voice.mime_type ?? 'audio/ogg',
      kind: 'voice',
    },
  });
});

bot().on('audio', async (ctx) => {
  if ((ctx.message.audio.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: ctx.from!.id,
      chatId: ctx.chat.id,
      fileId: ctx.message.audio.file_id,
      mimeType: ctx.message.audio.mime_type ?? 'audio/mpeg',
      kind: 'audio',
    },
  });
});

bot().on('video', async (ctx) => {
  if ((ctx.message.video.file_size ?? 0) > MAX_BYTES) {
    await ctx.reply('Send a shorter clip (under 20MB) or audio only.');
    return;
  }
  await ctx.reply('Got it. Cooking your card...');
  await inngest.send({
    name: 'capture/process',
    data: {
      userId: ctx.from!.id,
      chatId: ctx.chat.id,
      fileId: ctx.message.video.file_id,
      mimeType: ctx.message.video.mime_type ?? 'video/mp4',
      kind: 'video',
    },
  });
});
