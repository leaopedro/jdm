import type { FeedPostResponse, FeedSettings } from '@jdm/shared/feed';
import { describe, expect, it } from 'vitest';

// ── Access gate logic ─────────────────────────────────────────────────────────
// Mirrors EventFeedSection canView / canPost derivation exactly.

const resolveAccess = (feedSettings: FeedSettings, hasTicket: boolean) => ({
  canView:
    feedSettings.feedAccess === 'public' ||
    (feedSettings.feedAccess === 'attendees' && hasTicket),
  canPost: feedSettings.postingAccess === 'attendees' && hasTicket,
});

const BASE_SETTINGS: FeedSettings = {
  feedEnabled: true,
  feedAccess: 'attendees',
  postingAccess: 'attendees',
  maxPostsPerUser: null,
  maxPhotosPerUser: 5,
};

describe('EventFeedSection — access gates', () => {
  it('public feed: canView=true regardless of ticket', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'public' }, false);
    expect(canView).toBe(true);
  });

  it('attendees feed, no ticket: canView=false', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'attendees' }, false);
    expect(canView).toBe(false);
  });

  it('attendees feed, has ticket: canView=true', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'attendees' }, true);
    expect(canView).toBe(true);
  });

  it('attendees posting, no ticket: canPost=false', () => {
    const { canPost } = resolveAccess({ ...BASE_SETTINGS, postingAccess: 'attendees' }, false);
    expect(canPost).toBe(false);
  });

  it('attendees posting, has ticket: canPost=true', () => {
    const { canPost } = resolveAccess({ ...BASE_SETTINGS, postingAccess: 'attendees' }, true);
    expect(canPost).toBe(true);
  });

  it('organizers_only posting, has ticket: canPost=false', () => {
    const { canPost } = resolveAccess(
      { ...BASE_SETTINGS, postingAccess: 'organizers_only' },
      true,
    );
    expect(canPost).toBe(false);
  });

  it('members_only posting, has ticket: canPost=false', () => {
    const { canPost } = resolveAccess(
      { ...BASE_SETTINGS, postingAccess: 'members_only' },
      true,
    );
    expect(canPost).toBe(false);
  });
});

// ── Optimistic reaction toggle ────────────────────────────────────────────────
// Mirrors the handleReaction state update logic in EventFeedSection.

const makePost = (overrides: Partial<FeedPostResponse> = {}): FeedPostResponse => ({
  id: 'p1',
  eventId: 'e1',
  car: null,
  body: 'post body',
  status: 'visible',
  photos: [],
  reactions: { likes: 3, mine: false },
  commentCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const applyUnlikeOptimistic = (post: FeedPostResponse): FeedPostResponse => ({
  ...post,
  reactions: { likes: Math.max(0, post.reactions.likes - 1), mine: false },
});

describe('EventFeedSection — optimistic reaction state', () => {
  it('unlike decrements likes and clears mine flag', () => {
    const post = makePost({ reactions: { likes: 3, mine: true } });
    const next = applyUnlikeOptimistic(post);
    expect(next.reactions).toEqual({ likes: 2, mine: false });
  });

  it('unlike does not drop below 0', () => {
    const post = makePost({ reactions: { likes: 0, mine: true } });
    const next = applyUnlikeOptimistic(post);
    expect(next.reactions.likes).toBe(0);
  });

  it('server response replaces optimistic state on like', () => {
    const post = makePost({ reactions: { likes: 3, mine: false } });
    const serverResponse = { likes: 4, mine: true };
    const posts = [post];
    const updated = posts.map((p) =>
      p.id === post.id ? { ...p, reactions: serverResponse } : p,
    );
    expect(updated[0]?.reactions).toEqual({ likes: 4, mine: true });
  });
});

// ── Pagination state ──────────────────────────────────────────────────────────
// Mirrors loadPage accumulation and hasMore derivation.

const applyLoadPage = (
  prev: FeedPostResponse[],
  incoming: FeedPostResponse[],
  replace: boolean,
): FeedPostResponse[] => (replace ? incoming : [...prev, ...incoming]);

const hasMore = (page: number, totalPages: number): boolean => page < totalPages;

describe('EventFeedSection — pagination', () => {
  const p1 = makePost({ id: 'p1' });
  const p2 = makePost({ id: 'p2' });
  const p3 = makePost({ id: 'p3' });

  it('replace=true on page 1 replaces posts', () => {
    const result = applyLoadPage([p1, p2], [p3], true);
    expect(result).toEqual([p3]);
  });

  it('replace=false on page 2 appends posts', () => {
    const result = applyLoadPage([p1, p2], [p3], false);
    expect(result).toEqual([p1, p2, p3]);
  });

  it('hasMore true when page < totalPages', () => {
    expect(hasMore(1, 3)).toBe(true);
  });

  it('hasMore false when page equals totalPages', () => {
    expect(hasMore(3, 3)).toBe(false);
  });

  it('hasMore false when page exceeds totalPages', () => {
    expect(hasMore(4, 3)).toBe(false);
  });
});
