import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  countMock,
  insertValuesMock,
  insertMock,
  transcribeMock,
  extractMock,
  getProfileMock,
  createContactMock,
  addInteractionMock,
  findByNameAndCompanyMock,
  renderCardMock,
  buildCaptionMock,
  sendPhotoMock,
  sendMessageMock,
  uploadPhotoMock,
} = vi.hoisted(() => {
  const countMock = vi.fn().mockResolvedValue([{ count: 0 }]);
  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });
  const transcribeMock = vi.fn();
  const extractMock = vi.fn();
  const getProfileMock = vi.fn();
  const createContactMock = vi.fn();
  const addInteractionMock = vi.fn();
  const findByNameAndCompanyMock = vi.fn();
  const renderCardMock = vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const buildCaptionMock = vi.fn().mockReturnValue('caption');
  const sendPhotoMock = vi.fn().mockResolvedValue(undefined);
  const sendMessageMock = vi.fn().mockResolvedValue(undefined);
  const uploadPhotoMock = vi.fn().mockResolvedValue('https://pub-test.r2.dev/cards/test.png');
  return {
    countMock, insertValuesMock, insertMock,
    transcribeMock, extractMock, getProfileMock,
    createContactMock, addInteractionMock, findByNameAndCompanyMock,
    renderCardMock, buildCaptionMock,
    sendPhotoMock, sendMessageMock, uploadPhotoMock,
  };
});

vi.mock('../lib/db/client', () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: () => countMock() }) }),
    insert: insertMock,
  }),
}));

vi.mock('../lib/env', () => ({ env: () => ({ MAX_CAPTURES_PER_DAY: 3, TELEGRAM_BOT_TOKEN: 'tok' }) }));

vi.mock('./TranscriptionService', () => ({ transcribe: transcribeMock }));

vi.mock('./ExtractionService', () => ({ extract: extractMock }));

vi.mock('./UserProfileService', () => ({ getProfile: getProfileMock }));

vi.mock('./ContactService', () => ({
  createContact: createContactMock,
  addInteraction: addInteractionMock,
  findByNameAndCompany: findByNameAndCompanyMock,
}));

vi.mock('./CardService', () => ({
  renderCard: renderCardMock,
  buildCaption: buildCaptionMock,
}));

vi.mock('@/lib/telegram/send', () => ({
  sendPhoto: sendPhotoMock,
  sendMessage: sendMessageMock,
}));

vi.mock('../lib/r2/client', () => ({ uploadPhoto: uploadPhotoMock }));

import { processCapture } from './CaptureService';

describe('processCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue([{ count: 0 }]);
    getProfileMock.mockResolvedValue({
      telegramUserId: 1, displayName: 'Tim', tagline: 't',
      telegramUsername: 'timnan', photoR2Url: null, selfIntro: 's',
      socials: {},
    });
    transcribeMock.mockResolvedValue('hi I met Sarah');
    extractMock.mockResolvedValue({
      contacts: [{
        name: 'Sarah', role: null, company: null, emails: [], links: {},
        context: 'met', recap: 'we talked', user_commitments: [], their_commitments: [],
      }],
      was_live_recording: false,
    });
    findByNameAndCompanyMock.mockResolvedValue(null);
    createContactMock.mockResolvedValue({ id: 'uuid-1', name: 'Sarah' });
    addInteractionMock.mockResolvedValue('interaction-uuid-1');
    renderCardMock.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    buildCaptionMock.mockReturnValue('caption');
    sendPhotoMock.mockResolvedValue({ photoFileId: 'mock-file-id' });
    sendMessageMock.mockResolvedValue(undefined);
    uploadPhotoMock.mockResolvedValue('https://pub-test.r2.dev/cards/interaction-uuid-1.png');
    insertMock.mockReturnValue({ values: insertValuesMock });
    insertValuesMock.mockResolvedValue(undefined);
  });

  it('runs the full pipeline and sends one photo per contact', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/foo.oga' } })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer));

    await processCapture({ userId: 1, chatId: 1, fileId: 'F', mimeType: 'audio/ogg', kind: 'voice' });

    expect(transcribeMock).toHaveBeenCalled();
    expect(extractMock).toHaveBeenCalled();
    expect(createContactMock).toHaveBeenCalled();
    expect(addInteractionMock).toHaveBeenCalled();
    expect(renderCardMock).toHaveBeenCalledTimes(1);
    expect(sendPhotoMock).toHaveBeenCalledTimes(1);
  });

  it('refuses when daily cap is reached', async () => {
    countMock.mockResolvedValueOnce([{ count: 3 }]); // cap=3, hits limit
    await processCapture({ userId: 1, chatId: 1, fileId: 'F', mimeType: 'audio/ogg', kind: 'voice' });
    expect(transcribeMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: 1 }), expect.stringContaining('Daily limit'));
  });

  it('asks for name when extraction returns no contacts', async () => {
    extractMock.mockResolvedValueOnce({ contacts: [], was_live_recording: false });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/foo.oga' } })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]).buffer));

    await processCapture({ userId: 1, chatId: 1, fileId: 'F', mimeType: 'audio/ogg', kind: 'voice' });
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({ chatId: 1 }), expect.stringContaining("couldn't pin down a name"));
    expect(sendPhotoMock).not.toHaveBeenCalled();
  });
});
