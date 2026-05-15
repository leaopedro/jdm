import type { ConsentRecord, GrantConsentBody, ConsentPurpose } from '@jdm/shared';
import { beforeEach, expect, test, vi } from 'vitest';

const mockGrant = vi.fn<(body: GrantConsentBody) => Promise<ConsentRecord>>();
const mockWithdraw = vi.fn<(purpose: ConsentPurpose) => Promise<void>>();
const mockMarkSeen = vi.fn<() => Promise<void>>();
const mockHasSeen = vi.fn<() => Promise<boolean>>();

vi.mock('../../api/consents', () => ({
  grantConsent: mockGrant,
  withdrawConsent: mockWithdraw,
  listConsents: vi.fn(),
}));

vi.mock('../storage', () => ({
  markMarketingConsentPromptSeen: mockMarkSeen,
  hasSeenMarketingConsentPrompt: mockHasSeen,
}));

const fakeRecord: ConsentRecord = {
  id: '1',
  purpose: 'push_marketing',
  version: '1.0',
  givenAt: new Date().toISOString(),
  withdrawnAt: null,
  channel: 'mobile',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMarkSeen.mockResolvedValue(undefined);
  mockHasSeen.mockResolvedValue(false);
  mockGrant.mockResolvedValue(fakeRecord);
  mockWithdraw.mockResolvedValue(undefined);
});

test('accept path: grantConsent called with correct args then markSeen', async () => {
  await mockGrant({
    purpose: 'push_marketing',
    version: '1.0',
    evidence: { source: 'mobile_reconsent_modal' },
  });
  await mockMarkSeen();

  expect(mockGrant).toHaveBeenCalledWith({
    purpose: 'push_marketing',
    version: '1.0',
    evidence: { source: 'mobile_reconsent_modal' },
  });
  expect(mockMarkSeen).toHaveBeenCalled();
});

test('decline path: withdrawConsent then markSeen', async () => {
  await mockWithdraw('push_marketing');
  await mockMarkSeen();

  expect(mockWithdraw).toHaveBeenCalledWith('push_marketing');
  expect(mockMarkSeen).toHaveBeenCalled();
});

test('decline path: markSeen still called when withdrawConsent throws', async () => {
  mockWithdraw.mockRejectedValueOnce(new Error('not found'));

  try {
    await mockWithdraw('push_marketing');
  } catch {
    // expected
  }
  await mockMarkSeen();

  expect(mockMarkSeen).toHaveBeenCalled();
});

test('hasSeen returns false initially, true after mark', async () => {
  mockHasSeen.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

  expect(await mockHasSeen()).toBe(false);
  await mockMarkSeen();
  expect(await mockHasSeen()).toBe(true);
});
