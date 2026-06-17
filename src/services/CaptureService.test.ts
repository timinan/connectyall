import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  countMock,
  insertValuesMock,
  insertMock,
  transcribeMock,
  extractMock,
  getByIdMock,
  createContactMock,
  findByNameAndCompanyMock,
  renderCardMock,
  uploadBytesMock,
  markReadyMock,
  markFailedMock,
  mintStubMock,
} = vi.hoisted(() => {
  const countMock = vi.fn().mockResolvedValue([{ count: 0 }]);
  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });
  const transcribeMock = vi.fn();
  const extractMock = vi.fn();
  const getByIdMock = vi.fn();
  const createContactMock = vi.fn();
  const findByNameAndCompanyMock = vi.fn();
  const renderCardMock = vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const uploadBytesMock = vi.fn().mockResolvedValue(undefined);
  const markReadyMock = vi.fn().mockResolvedValue(undefined);
  const markFailedMock = vi.fn().mockResolvedValue(undefined);
  const mintStubMock = vi.fn().mockResolvedValue('extra-interaction-id');
  return {
    countMock, insertValuesMock, insertMock,
    transcribeMock, extractMock, getByIdMock,
    createContactMock, findByNameAndCompanyMock,
    renderCardMock, uploadBytesMock,
    markReadyMock, markFailedMock, mintStubMock,
  };
});

vi.mock('../lib/db/client', () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: () => countMock() }) }),
    insert: insertMock,
  }),
}));

vi.mock('../lib/env', () => ({ env: () => ({ MAX_CAPTURES_PER_DAY: 3, R2_PUBLIC_URL_BASE: 'https://pub-test.r2.dev' }) }));

vi.mock('./TranscriptionService', () => ({ transcribe: transcribeMock }));

vi.mock('./ExtractionService', () => ({ extract: extractMock }));

vi.mock('./UserProfileService', () => ({ getById: getByIdMock }));

vi.mock('./InteractionService', () => ({
  markReady: markReadyMock,
  markFailed: markFailedMock,
  mintStub: mintStubMock,
}));

vi.mock('./ContactService', () => ({
  createContact: createContactMock,
  findByNameAndCompany: findByNameAndCompanyMock,
}));

vi.mock('./CardService', () => ({
  renderCard: renderCardMock,
  buildCaption: vi.fn().mockReturnValue('caption'),
}));

vi.mock('../lib/r2/client', () => ({ uploadBytes: uploadBytesMock }));

import { processCapture } from './CaptureService';

const baseInput = {
  userId: 'user-uuid-1',
  audioR2Key: 'captures/test.webm',
  mimeType: 'audio/webm',
  interactionId: 'interaction-uuid-1',
};

describe('processCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue([{ count: 0 }]);
    getByIdMock.mockResolvedValue({
      id: 'user-uuid-1',
      displayName: 'Tim',
      tagline: 't',
      telegramUsername: 'timnan',
      photoR2Url: null,
      selfIntro: 's',
      socials: {},
    });
    transcribeMock.mockResolvedValue('hi I met Sarah');
    extractMock.mockResolvedValue({
      contacts: [{
        name: 'Sarah', role: null, company: null, emails: [], phones: [], preferred_channel: null, links: {},
        context: 'met', recap: 'we talked', user_commitments: [], their_commitments: [],
      }],
      was_live_recording: false,
    });
    findByNameAndCompanyMock.mockResolvedValue(null);
    createContactMock.mockResolvedValue({ id: 'contact-uuid-1', name: 'Sarah' });
    renderCardMock.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    uploadBytesMock.mockResolvedValue(undefined);
    insertMock.mockReturnValue({ values: insertValuesMock });
    insertValuesMock.mockResolvedValue(undefined);

    // Mock R2 download
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer)
    );
  });

  it('runs the full pipeline and marks interaction ready', async () => {
    await processCapture(baseInput);

    expect(transcribeMock).toHaveBeenCalled();
    expect(extractMock).toHaveBeenCalled();
    expect(createContactMock).toHaveBeenCalled();
    expect(renderCardMock).toHaveBeenCalledTimes(1);
    expect(markReadyMock).toHaveBeenCalledWith(
      'interaction-uuid-1',
      'contact-uuid-1',
      expect.objectContaining({ name: 'Sarah' })
    );
    expect(uploadBytesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cards/interaction-uuid-1.png' })
    );
  });

  it('refuses when daily cap is reached, marks interaction failed', async () => {
    countMock.mockResolvedValueOnce([{ count: 3 }]);
    await processCapture(baseInput);
    expect(markFailedMock).toHaveBeenCalledWith('interaction-uuid-1');
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it('marks failed when extraction returns no contacts', async () => {
    extractMock.mockResolvedValueOnce({ contacts: [], was_live_recording: false });
    await processCapture(baseInput);
    expect(markFailedMock).toHaveBeenCalledWith('interaction-uuid-1');
    expect(markReadyMock).not.toHaveBeenCalled();
  });

  it('marks failed when profile is missing', async () => {
    getByIdMock.mockResolvedValueOnce(null);
    await processCapture(baseInput);
    expect(markFailedMock).toHaveBeenCalledWith('interaction-uuid-1');
    expect(transcribeMock).not.toHaveBeenCalled();
  });
});
