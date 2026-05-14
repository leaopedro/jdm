import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as client from '../../../../api/client';

vi.mock('../../../../api/client', () => ({
  request: vi.fn(),
  authedRequest: vi.fn(),
}));

const mockRequest = vi.mocked(client.request);
const mockAuthed = vi.mocked(client.authedRequest);

describe('feed API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listFeedPosts calls GET /events/:slug/feed with page param', async () => {
    const { listFeedPosts } = await import('../../../../api/feed');
    mockRequest.mockResolvedValueOnce({ posts: [], page: 1, totalPages: 1, total: 0 });
    await listFeedPosts('slug-a', 1);
    expect(mockRequest).toHaveBeenCalledWith('/events/slug-a/feed?page=1', expect.anything());
  });

  it('createFeedPost calls POST /events/:slug/feed', async () => {
    const { createFeedPost } = await import('../../../../api/feed');
    const post = {
      id: '1',
      eventId: 'e1',
      car: null,
      body: 'hi',
      status: 'visible',
      photos: [],
      reactions: { likes: 0, mine: false },
      commentCount: 0,
      createdAt: '',
      updatedAt: '',
    };
    mockAuthed.mockResolvedValueOnce(post);
    await createFeedPost('slug-a', { body: 'hi' });
    expect(mockAuthed).toHaveBeenCalledWith('/events/slug-a/feed', expect.anything(), {
      method: 'POST',
      body: { body: 'hi' },
    });
  });

  it('toggleFeedReaction calls POST /feed/:id/reactions', async () => {
    const { toggleFeedReaction } = await import('../../../../api/feed');
    mockAuthed.mockResolvedValueOnce({ likes: 1, mine: true });
    await toggleFeedReaction('post-1', 'like');
    expect(mockAuthed).toHaveBeenCalledWith('/feed/post-1/reactions', expect.anything(), {
      method: 'POST',
      body: { kind: 'like' },
    });
  });

  it('removeFeedReaction calls DELETE /feed/:id/reactions', async () => {
    const { removeFeedReaction } = await import('../../../../api/feed');
    mockAuthed.mockResolvedValueOnce(undefined);
    await removeFeedReaction('post-1');
    expect(mockAuthed).toHaveBeenCalledWith('/feed/post-1/reactions', expect.anything(), {
      method: 'DELETE',
    });
  });

  it('listFeedComments calls GET /feed/:id/comments', async () => {
    const { listFeedComments } = await import('../../../../api/feed');
    mockRequest.mockResolvedValueOnce({ comments: [], page: 1, totalPages: 1, total: 0 });
    await listFeedComments('post-1', 1);
    expect(mockRequest).toHaveBeenCalledWith('/feed/post-1/comments?page=1', expect.anything());
  });

  it('createFeedComment calls POST /feed/:id/comments', async () => {
    const { createFeedComment } = await import('../../../../api/feed');
    const comment = {
      id: 'c1',
      postId: 'p1',
      car: null,
      body: 'nice',
      status: 'visible',
      createdAt: '',
      updatedAt: '',
    };
    mockAuthed.mockResolvedValueOnce(comment);
    await createFeedComment('post-1', { body: 'nice' });
    expect(mockAuthed).toHaveBeenCalledWith('/feed/post-1/comments', expect.anything(), {
      method: 'POST',
      body: { body: 'nice' },
    });
  });

  it('deleteFeedPost calls DELETE /feed/:id', async () => {
    const { deleteFeedPost } = await import('../../../../api/feed');
    mockAuthed.mockResolvedValueOnce(undefined);
    await deleteFeedPost('post-1');
    expect(mockAuthed).toHaveBeenCalledWith('/feed/post-1', expect.anything(), {
      method: 'DELETE',
    });
  });
});
