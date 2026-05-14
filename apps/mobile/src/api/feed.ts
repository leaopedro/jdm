import {
  type FeedCommentCreateInput,
  feedCommentListResponseSchema,
  type FeedCommentListResponse,
  type FeedCommentResponse,
  feedCommentResponseSchema,
  type FeedListResponse,
  feedListResponseSchema,
  type FeedPostCreateInput,
  type FeedPostPatchInput,
  feedPostResponseSchema,
  type FeedPostResponse,
  feedReactionSummarySchema,
  type FeedReactionSummary,
} from '@jdm/shared/feed';
import { z } from 'zod';

import { authedRequest, request } from './client';

export const listFeedPosts = (slug: string, page: number): Promise<FeedListResponse> =>
  request(`/events/${encodeURIComponent(slug)}/feed?page=${page}`, feedListResponseSchema);

export const createFeedPost = (
  slug: string,
  input: FeedPostCreateInput,
): Promise<FeedPostResponse> =>
  authedRequest(`/events/${encodeURIComponent(slug)}/feed`, feedPostResponseSchema, {
    method: 'POST',
    body: input,
  });

export const patchFeedPost = (id: string, input: FeedPostPatchInput): Promise<FeedPostResponse> =>
  authedRequest(`/feed/${encodeURIComponent(id)}`, feedPostResponseSchema, {
    method: 'PATCH',
    body: input,
  });

export const deleteFeedPost = (id: string): Promise<void> =>
  authedRequest(`/feed/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' });

export const toggleFeedReaction = (
  postId: string,
  kind: 'like' | 'dislike',
): Promise<FeedReactionSummary> =>
  authedRequest(`/feed/${encodeURIComponent(postId)}/reactions`, feedReactionSummarySchema, {
    method: 'POST',
    body: { kind },
  });

export const removeFeedReaction = (postId: string): Promise<void> =>
  authedRequest(`/feed/${encodeURIComponent(postId)}/reactions`, z.undefined(), {
    method: 'DELETE',
  });

export const listFeedComments = (postId: string, page: number): Promise<FeedCommentListResponse> =>
  request(
    `/feed/${encodeURIComponent(postId)}/comments?page=${page}`,
    feedCommentListResponseSchema,
  );

export const createFeedComment = (
  postId: string,
  input: FeedCommentCreateInput,
): Promise<FeedCommentResponse> =>
  authedRequest(`/feed/${encodeURIComponent(postId)}/comments`, feedCommentResponseSchema, {
    method: 'POST',
    body: input,
  });
