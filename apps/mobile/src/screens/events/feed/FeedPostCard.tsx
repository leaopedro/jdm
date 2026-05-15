import type { FeedPostResponse } from '@jdm/shared/feed';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedComments } from './FeedComments';
import { FeedReactionsRow } from './FeedReactionsRow';

import { feedCopy } from '~/copy/feed';
import { theme } from '~/theme';

type Props = {
  post: FeedPostResponse;
  myCarId: string | null;
  isOwn: boolean;
  reactionLoading: boolean;
  onToggleReaction: (postId: string, kind: 'like' | 'dislike') => void;
  onEdit?: (post: FeedPostResponse) => void;
  onDelete?: (post: FeedPostResponse) => void;
};

export function FeedPostCard({
  post,
  myCarId,
  isOwn,
  reactionLoading,
  onToggleReaction,
  onEdit,
  onDelete,
}: Props) {
  const car = post.car;
  const carLabel = car ? `${car.nickname ?? car.make} ${car.model} ${car.year}` : '—';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {car?.photo?.url ? (
          <Image
            source={{ uri: car.photo.url }}
            style={styles.carPhoto}
            accessibilityLabel={carLabel}
          />
        ) : (
          <View style={[styles.carPhoto, styles.carPhotoPlaceholder]} />
        )}
        <View style={styles.carInfo}>
          <Text style={styles.carName}>{carLabel}</Text>
        </View>
        {isOwn ? (
          <View style={styles.actions}>
            {onEdit ? (
              <Pressable
                onPress={() => onEdit(post)}
                accessibilityRole="button"
                accessibilityLabel={feedCopy.post.menu.edit}
                hitSlop={8}
                style={styles.actionBtn}
              >
                <Text style={styles.actionText}>{feedCopy.post.menu.edit}</Text>
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                onPress={() => onDelete(post)}
                accessibilityRole="button"
                accessibilityLabel={feedCopy.post.menu.delete}
                hitSlop={8}
                style={styles.actionBtn}
              >
                <Text style={[styles.actionText, styles.deleteText]}>
                  {feedCopy.post.menu.delete}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.body}>{post.body}</Text>

      {post.photos.length > 0 ? (
        <Image
          source={{ uri: post.photos[0]?.url }}
          style={styles.photo}
          accessibilityLabel="Foto do post"
        />
      ) : null}

      <FeedReactionsRow
        reactions={post.reactions}
        myKind={post.reactions.mine ? 'like' : null}
        loading={reactionLoading}
        onToggle={(kind) => onToggleReaction(post.id, kind)}
      />

      <FeedComments
        eventId={post.eventId}
        postId={post.id}
        commentCount={post.commentCount}
        myCarId={myCarId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  carPhoto: { width: 40, height: 40, borderRadius: 20 },
  carPhotoPlaceholder: { backgroundColor: theme.colors.bg },
  carInfo: { flex: 1 },
  carName: { color: theme.colors.fg, fontWeight: '600', fontSize: theme.font.size.sm },
  actions: { flexDirection: 'row', gap: theme.spacing.xs },
  actionBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  actionText: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  deleteText: { color: theme.colors.accent },
  body: { color: theme.colors.fg, fontSize: theme.font.size.md, lineHeight: 20 },
  photo: { width: '100%', height: 200, borderRadius: theme.radii.md },
});
