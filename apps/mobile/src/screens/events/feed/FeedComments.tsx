import type { FeedCommentResponse } from '@jdm/shared/feed';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createFeedComment, listFeedComments } from '~/api/feed';
import { useAuth } from '~/auth/context';
import { feedCopy } from '~/copy/feed';
import { theme } from '~/theme';

type Props = {
  eventId: string;
  postId: string;
  commentCount: number;
  myCarId: string | null;
};

export function FeedComments({ eventId, postId, commentCount, myCarId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<FeedCommentResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === 'authenticated';

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    void listFeedComments(eventId, postId, 1)
      .then((res) => {
        if (!cancelled) setComments(res.comments);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, postId]);

  const handleSubmit = async () => {
    if (!draft.trim() || !myCarId) return;
    setSubmitting(true);
    try {
      const comment = await createFeedComment(eventId, postId, { body: draft.trim(), carId: myCarId });
      setComments((prev) => [...prev, comment]);
      setDraft('');
    } catch {
      // silent — no UX crash on comment error
    } finally {
      setSubmitting(false);
    }
  };

  if (commentCount === 0 && !expanded && !(isAuthed && myCarId)) return null;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? feedCopy.post.comments.hide
            : feedCopy.post.comments.show(commentCount)
        }
        hitSlop={8}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {expanded
            ? feedCopy.post.comments.hide
            : feedCopy.post.comments.show(commentCount)}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.list}>
          {loading ? <ActivityIndicator size="small" color={theme.colors.muted} /> : null}
          {comments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <Text style={styles.commentAuthor}>
                {c.car ? `${c.car.nickname ?? c.car.make} ${c.car.model}` : '—'}
              </Text>
              <Text style={styles.commentBody}>{c.body}</Text>
            </View>
          ))}
          {isAuthed && myCarId ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={feedCopy.post.comments.placeholder}
                placeholderTextColor={theme.colors.muted}
                value={draft}
                onChangeText={setDraft}
                returnKeyType="send"
                onSubmitEditing={() => void handleSubmit()}
                editable={!submitting}
                accessibilityLabel={feedCopy.post.comments.placeholder}
              />
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting || !draft.trim()}
                style={styles.sendBtn}
                accessibilityRole="button"
                accessibilityLabel={feedCopy.post.comments.submit}
                hitSlop={8}
              >
                <Text style={styles.sendText}>{feedCopy.post.comments.submit}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing.xs },
  toggle: { paddingVertical: theme.spacing.xs },
  toggleText: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  list: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  comment: { gap: 2 },
  commentAuthor: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  commentBody: { color: theme.colors.fg, fontSize: theme.font.size.sm },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  input: {
    flex: 1,
    color: theme.colors.fg,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.font.size.md,
  },
  sendBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  sendText: { color: theme.colors.accent, fontSize: theme.font.size.sm, fontWeight: '600' },
});
