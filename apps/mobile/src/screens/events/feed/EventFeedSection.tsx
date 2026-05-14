import type { Car } from '@jdm/shared/cars';
import type { FeedListResponse, FeedPostResponse, FeedSettings } from '@jdm/shared/feed';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  createFeedPost,
  deleteFeedPost,
  listFeedPosts,
  patchFeedPost,
  removeFeedReaction,
  toggleFeedReaction,
} from '~/api/feed';
import { listCars } from '~/api/cars';
import { useAuth } from '~/auth/context';
import { feedCopy } from '~/copy/feed';
import { theme } from '~/theme';
import { FeedComposerSheet } from './FeedComposerSheet';
import { FeedLockedCard } from './FeedLockedCard';
import { FeedPostCard } from './FeedPostCard';
import { TicketStrip } from './TicketStrip';

const PAGE_SIZE = 5;

type Props = {
  eventSlug: string;
  eventId: string;
  feedSettings: FeedSettings;
  hasTicket: boolean;
};

export function EventFeedSection({ eventSlug, eventId, feedSettings, hasTicket }: Props) {
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const isAuthed = authStatus === 'authenticated';

  const [posts, setPosts] = useState<FeedPostResponse[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [myCars, setMyCars] = useState<Car[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPostResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [reactionLoadingIds, setReactionLoadingIds] = useState<Set<string>>(new Set());

  const myCarId = myCars[0]?.id ?? null;

  const canView =
    feedSettings.feedAccess === 'public' ||
    (feedSettings.feedAccess === 'attendees' && hasTicket);
  const canPost = feedSettings.postingAccess === 'attendees' && hasTicket;

  const loadPage = useCallback(
    async (p: number, replace: boolean) => {
      try {
        const res: FeedListResponse = await listFeedPosts(eventSlug, p);
        setPosts((prev) => (replace ? res.posts : [...prev, ...res.posts]));
        setPage(res.page);
        setTotalPages(res.totalPages);
        setLoadError(false);
      } catch {
        setLoadError(true);
      }
    },
    [eventSlug],
  );

  useEffect(() => {
    setLoading(true);
    void loadPage(1, true).finally(() => setLoading(false));
  }, [loadPage]);

  useEffect(() => {
    if (!isAuthed) {
      setMyCars([]);
      return;
    }
    void listCars()
      .then(setMyCars)
      .catch(() => setMyCars([]));
  }, [isAuthed]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPage(1, true);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await loadPage(page + 1, false);
    setLoadingMore(false);
  };

  const handleReaction = async (postId: string, kind: 'like' | 'dislike') => {
    setReactionLoadingIds((s) => new Set(s).add(postId));
    try {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;
      const currentlyLiked = post.reactions.mine;
      if (currentlyLiked) {
        await removeFeedReaction(postId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, reactions: { likes: Math.max(0, p.reactions.likes - 1), mine: false } }
              : p,
          ),
        );
      } else {
        const updated = await toggleFeedReaction(postId, kind);
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reactions: updated } : p)));
      }
    } catch {
      // silent optimistic failure
    } finally {
      setReactionLoadingIds((s) => {
        const next = new Set(s);
        next.delete(postId);
        return next;
      });
    }
  };

  const handleComposerSubmit = async (body: string, carId: string | undefined) => {
    setSubmitting(true);
    try {
      if (editingPost) {
        const updated = await patchFeedPost(editingPost.id, { body });
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const newPost = await createFeedPost(eventSlug, { body, carId });
        setPosts((prev) => [newPost, ...prev]);
      }
      setComposerOpen(false);
      setEditingPost(null);
    } catch {
      Alert.alert(feedCopy.errors.postFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = (post: FeedPostResponse) => {
    Alert.alert(feedCopy.composer.deleteConfirm, undefined, [
      { text: feedCopy.composer.cancel, style: 'cancel' },
      {
        text: feedCopy.composer.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFeedPost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch {
            Alert.alert(feedCopy.errors.postFailed);
          }
        },
      },
    ]);
  };

  const navigateToTicket = () => {
    if (hasTicket) {
      router.push({ pathname: '/tickets', params: { eventId } } as never);
    } else {
      router.push(`/events/${eventSlug}/buy` as never);
    }
  };

  const isComposerVisible = composerOpen || editingPost !== null;

  return (
    <View
      style={styles.container}
      importantForAccessibility={isComposerVisible ? 'no-hide-descendants' : 'auto'}
    >
      <TicketStrip hasTicket={hasTicket} onPress={navigateToTicket} />

      {!canView ? <FeedLockedCard kind="view" onCtaPress={navigateToTicket} /> : null}

      {canView && !canPost ? (
        <FeedLockedCard kind="post" onCtaPress={navigateToTicket} />
      ) : null}

      {canView && canPost && isAuthed ? (
        <TouchableOpacity
          onPress={() => {
            setEditingPost(null);
            setComposerOpen(true);
          }}
          style={styles.composerEntry}
          accessibilityRole="button"
          accessibilityLabel={feedCopy.composer.placeholder}
        >
          <Text style={styles.composerEntryText}>{feedCopy.composer.placeholder}</Text>
        </TouchableOpacity>
      ) : null}

      {canView ? (
        <ScrollView
          style={styles.feed}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={theme.colors.muted}
            />
          }
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.muted} style={styles.spinner} />
          ) : loadError ? (
            <Text style={styles.errorText}>{feedCopy.errors.loadFailed}</Text>
          ) : posts.length === 0 ? (
            <Text style={styles.emptyText}>{feedCopy.pagination.empty}</Text>
          ) : (
            posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                myCarId={myCarId}
                isOwn={myCars.some((c) => c.id === post.car?.id)}
                reactionLoading={reactionLoadingIds.has(post.id)}
                onToggleReaction={handleReaction}
                onEdit={
                  canPost
                    ? (p) => {
                        setEditingPost(p);
                        setComposerOpen(true);
                      }
                    : undefined
                }
                onDelete={canPost ? handleDeletePost : undefined}
              />
            ))
          )}

          {!loading && page < totalPages ? (
            <TouchableOpacity
              onPress={() => void handleLoadMore()}
              disabled={loadingMore}
              style={styles.loadMoreBtn}
              accessibilityRole="button"
              accessibilityLabel={feedCopy.pagination.loadMore(PAGE_SIZE)}
            >
              {loadingMore ? (
                <ActivityIndicator color={theme.colors.muted} />
              ) : (
                <Text style={styles.loadMoreText}>{feedCopy.pagination.loadMore(PAGE_SIZE)}</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {!loading && page >= totalPages && posts.length > 0 ? (
            <Text style={styles.noMoreText}>{feedCopy.pagination.noMore}</Text>
          ) : null}
        </ScrollView>
      ) : null}

      <FeedComposerSheet
        visible={isComposerVisible}
        cars={myCars}
        editingPost={editingPost}
        submitting={submitting}
        onSubmit={(body, carId) => void handleComposerSubmit(body, carId)}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  feed: { flex: 1, paddingHorizontal: theme.spacing.lg },
  spinner: { marginTop: theme.spacing.xl },
  errorText: { color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.xl },
  emptyText: { color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.xl },
  composerEntry: {
    margin: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  composerEntryText: { color: theme.colors.muted, fontSize: theme.font.size.md },
  loadMoreBtn: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  loadMoreText: { color: theme.colors.accent, fontWeight: '600', fontSize: theme.font.size.md },
  noMoreText: {
    color: theme.colors.muted,
    textAlign: 'center',
    marginVertical: theme.spacing.lg,
  },
});
