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

const enc = encodeURIComponent;

export const listFeedPosts = (slug: string, page: number): Promise<FeedListResponse> =>
  request(`/events/${enc(slug)}/feed?page=${page}`, feedListResponseSchema);

export const createFeedPost = (
  slug: string,
  input: FeedPostCreateInput,
): Promise<FeedPostResponse> =>
  authedRequest(`/events/${enc(slug)}/feed`, feedPostResponseSchema, {
    method: 'POST',
    body: input,
  });

export const patchFeedPost = (
  eventId: string,
  postId: string,
  input: FeedPostPatchInput,
): Promise<FeedPostResponse> =>
  authedRequest(`/events/${enc(eventId)}/feed/${enc(postId)}`, feedPostResponseSchema, {
    method: 'PATCH',
    body: input,
  });

export const deleteFeedPost = (eventId: string, postId: string): Promise<void> =>
  authedRequest(`/events/${enc(eventId)}/feed/${enc(postId)}`, z.undefined(), { method: 'DELETE' });

export const toggleFeedReaction = (
  eventId: string,
  postId: string,
  kind: 'like' | 'dislike',
): Promise<FeedReactionSummary> =>
  authedRequest(
    `/events/${enc(eventId)}/feed/${enc(postId)}/reactions`,
    feedReactionSummarySchema,
    { method: 'POST', body: { kind } },
  );

export const removeFeedReaction = (eventId: string, postId: string): Promise<void> =>
  authedRequest(`/events/${enc(eventId)}/feed/${enc(postId)}/reactions`, z.undefined(), {
    method: 'DELETE',
  });

export const listFeedComments = (
  eventId: string,
  postId: string,
  page: number,
): Promise<FeedCommentListResponse> =>
  request(
    `/events/${enc(eventId)}/feed/${enc(postId)}/comments?page=${page}`,
    feedCommentListResponseSchema,
  );

export const createFeedComment = (
  eventId: string,
  postId: string,
  input: FeedCommentCreateInput,
): Promise<FeedCommentResponse> =>
  authedRequest(
    `/events/${enc(eventId)}/feed/${enc(postId)}/comments`,
    feedCommentResponseSchema,
    { method: 'POST', body: input },
  );
