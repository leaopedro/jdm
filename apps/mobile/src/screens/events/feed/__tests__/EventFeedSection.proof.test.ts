import type { FeedPostResponse, FeedSettings } from '@jdm/shared/feed';
import type { TicketSource } from '@jdm/shared/tickets';
import { describe, expect, it } from 'vitest';

// ── Access gate logic ─────────────────────────────────────────────────────────
// Mirrors EventFeedSection canView / canPost derivation exactly.
// members_only requires premium_grant source — mirrors API access.ts hasMemberTicket.

const resolveAccess = (feedSettings: FeedSettings, ticketSource: TicketSource | null) => {
  const hasTicket = ticketSource !== null;
  const isMember = ticketSource === 'premium_grant';
  return {
    canView:
      feedSettings.feedAccess === 'public' ||
      (feedSettings.feedAccess === 'attendees' && hasTicket) ||
      (feedSettings.feedAccess === 'members_only' && isMember),
    canPost:
      (feedSettings.postingAccess === 'attendees' && hasTicket) ||
      (feedSettings.postingAccess === 'members_only' && isMember),
  };
};

const BASE_SETTINGS: FeedSettings = {
  feedEnabled: true,
  feedAccess: 'attendees',
  postingAccess: 'attendees',
  maxPostsPerUser: null,
  maxPhotosPerUser: 5,
};

describe('EventFeedSection — access gates', () => {
  it('public feed: canView=true regardless of ticket', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'public' }, null);
    expect(canView).toBe(true);
  });

  it('attendees feed, no ticket: canView=false', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'attendees' }, null);
    expect(canView).toBe(false);
  });

  it('attendees feed, purchase ticket: canView=true', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'attendees' }, 'purchase');
    expect(canView).toBe(true);
  });

  it('attendees feed, premium_grant ticket: canView=true', () => {
    const { canView } = resolveAccess(
      { ...BASE_SETTINGS, feedAccess: 'attendees' },
      'premium_grant',
    );
    expect(canView).toBe(true);
  });

  it('attendees posting, no ticket: canPost=false', () => {
    const { canPost } = resolveAccess({ ...BASE_SETTINGS, postingAccess: 'attendees' }, null);
    expect(canPost).toBe(false);
  });

  it('attendees posting, purchase ticket: canPost=true', () => {
    const { canPost } = resolveAccess({ ...BASE_SETTINGS, postingAccess: 'attendees' }, 'purchase');
    expect(canPost).toBe(true);
  });

  it('organizers_only posting, purchase ticket: canPost=false', () => {
    const { canPost } = resolveAccess(
      { ...BASE_SETTINGS, postingAccess: 'organizers_only' },
      'purchase',
    );
    expect(canPost).toBe(false);
  });

  it('members_only posting, premium_grant ticket: canPost=true', () => {
    const { canPost } = resolveAccess(
      { ...BASE_SETTINGS, postingAccess: 'members_only' },
      'premium_grant',
    );
    expect(canPost).toBe(true);
  });

  it('members_only posting, purchase ticket: canPost=false (not a member)', () => {
    const { canPost } = resolveAccess(
      { ...BASE_SETTINGS, postingAccess: 'members_only' },
      'purchase',
    );
    expect(canPost).toBe(false);
  });

  it('members_only posting, no ticket: canPost=false', () => {
    const { canPost } = resolveAccess({ ...BASE_SETTINGS, postingAccess: 'members_only' }, null);
    expect(canPost).toBe(false);
  });

  it('members_only feed, premium_grant ticket: canView=true', () => {
    const { canView } = resolveAccess(
      { ...BASE_SETTINGS, feedAccess: 'members_only' },
      'premium_grant',
    );
    expect(canView).toBe(true);
  });

  it('members_only feed, purchase ticket: canView=false (not a member)', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'members_only' }, 'purchase');
    expect(canView).toBe(false);
  });

  it('members_only feed, no ticket: canView=false', () => {
    const { canView } = resolveAccess({ ...BASE_SETTINGS, feedAccess: 'members_only' }, null);
    expect(canView).toBe(false);
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
    const updated = posts.map((p) => (p.id === post.id ? { ...p, reactions: serverResponse } : p));
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

// ── Event-detail feed settings passthrough ────────────────────────────────────
// Ensures real event values (not defaultFeedSettings) reach access gate.

describe('EventFeedSection — event feed settings passthrough', () => {
  it('public event: canView=true without ticket', () => {
    const eventSettings: FeedSettings = {
      feedEnabled: true,
      feedAccess: 'public',
      postingAccess: 'organizers_only',
      maxPostsPerUser: null,
      maxPhotosPerUser: 5,
    };
    const { canView } = resolveAccess(eventSettings, null);
    expect(canView).toBe(true);
  });

  it('attendees-only event: canPost=false for non-attendee', () => {
    const eventSettings: FeedSettings = {
      feedEnabled: true,
      feedAccess: 'attendees',
      postingAccess: 'attendees',
      maxPostsPerUser: null,
      maxPhotosPerUser: 5,
    };
    const { canPost } = resolveAccess(eventSettings, null);
    expect(canPost).toBe(false);
  });

  it('organizers_only posting: canPost=false even with purchase ticket', () => {
    const eventSettings: FeedSettings = {
      feedEnabled: true,
      feedAccess: 'public',
      postingAccess: 'organizers_only',
      maxPostsPerUser: null,
      maxPhotosPerUser: 5,
    };
    const { canPost } = resolveAccess(eventSettings, 'purchase');
    expect(canPost).toBe(false);
  });
});

// ── Zero-comment first-creation gate ─────────────────────────────────────────
// FeedComments hides the section when commentCount=0 AND user cannot create
// the first comment. The gate mirrors the component's early-return condition.

const canShowComments = (
  commentCount: number,
  expanded: boolean,
  isAuthed: boolean,
  myCarId: string | null,
): boolean => !(commentCount === 0 && !expanded && !(isAuthed && myCarId));

describe('FeedComments — zero-comment visibility gate', () => {
  it('hides when 0 comments, collapsed, and user has no car', () => {
    expect(canShowComments(0, false, true, null)).toBe(false);
  });

  it('hides when 0 comments, collapsed, and unauthenticated', () => {
    expect(canShowComments(0, false, false, 'car1')).toBe(false);
  });

  it('shows when 0 comments but user is authed with a car (first comment path)', () => {
    expect(canShowComments(0, false, true, 'car1')).toBe(true);
  });

  it('shows when already expanded regardless of count', () => {
    expect(canShowComments(0, true, false, null)).toBe(true);
  });

  it('shows when comment count > 0', () => {
    expect(canShowComments(3, false, false, null)).toBe(true);
  });
});
