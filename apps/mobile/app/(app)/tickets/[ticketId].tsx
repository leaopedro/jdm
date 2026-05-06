import type { MyTicket } from '@jdm/shared/tickets';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { listMyTickets, updateMyTicket } from '~/api/tickets';
import { ticketsCopy } from '~/copy/tickets';
import { formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

export default function TicketDetail() {
  useKeepAwake();
  const params = useLocalSearchParams<{ ticketId: string; ticket?: string }>();
  const ticketId = params.ticketId;
  const preloaded = params.ticket ? (JSON.parse(params.ticket) as MyTicket) : null;
  const [ticket, setTicket] = useState<MyTicket | null>(preloaded);
  const [loaded, setLoaded] = useState<boolean>(preloaded !== null);
  const [editing, setEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (preloaded) return;
    void (async () => {
      try {
        const { items } = await listMyTickets();
        setTicket(items.find((t) => t.id === ticketId) ?? null);
      } finally {
        setLoaded(true);
      }
    })();
  }, [ticketId, preloaded]);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!ticket) {
    return (
      <View style={styles.center}>
        <Text style={styles.sub}>{ticketsCopy.detail.notFound}</Text>
      </View>
    );
  }

  const label =
    ticket.status === 'valid'
      ? ticketsCopy.detail.valid
      : ticket.status === 'used'
        ? ticketsCopy.detail.used
        : ticketsCopy.detail.revoked;

  const nickname = ticket.nickname?.trim() || null;

  const openEdit = () => {
    setNicknameDraft(nickname ?? '');
    setSaveError(null);
    setEditing(true);
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(false);
  };

  const submit = async (next: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMyTicket(ticket.id, { nickname: next });
      setTicket(updated);
      setEditing(false);
    } catch {
      setSaveError(ticketsCopy.detail.nicknameError);
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    const trimmed = nicknameDraft.trim();
    if (trimmed.length === 0) {
      void submit(null);
      return;
    }
    void submit(trimmed);
  };

  const onRemove = () => {
    void submit(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{nickname ?? ticket.event.title}</Text>
        {nickname ? <Text style={styles.subTitle}>{ticket.event.title}</Text> : null}
        <Pressable
          onPress={openEdit}
          style={styles.editButton}
          accessibilityRole="button"
          accessibilityLabel={
            nickname ? ticketsCopy.detail.nicknameEdit : ticketsCopy.detail.nicknameAdd
          }
        >
          <Text style={styles.editButtonText}>
            {nickname ? ticketsCopy.detail.nicknameEdit : ticketsCopy.detail.nicknameAdd}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sub}>
        {formatEventDateRange(ticket.event.startsAt, ticket.event.endsAt)}
      </Text>
      <Text style={styles.sub}>{ticket.tierName}</Text>

      {ticket.status === 'used' ? (
        <View
          style={styles.qrUsedBox}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={ticketsCopy.detail.qrUsed}
        >
          <Text style={styles.qrUsedText}>{ticketsCopy.detail.qrUsed}</Text>
        </View>
      ) : (
        <>
          <View
            style={styles.qrBox}
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel={`QR code for ${ticket.event.title}`}
          >
            <QRCode value={ticket.code} size={240} />
          </View>
          <Text style={styles.hint}>{ticketsCopy.detail.brightness}</Text>
        </>
      )}
      <Text style={[styles.status, ticket.status !== 'valid' && styles.statusMuted]}>{label}</Text>

      {ticket.extras.length > 0 && (
        <View style={styles.extrasSection}>
          <Text style={styles.extrasTitle}>{ticketsCopy.detail.extrasTitle}</Text>
          {ticket.extras.map((extra) => {
            const isUsed = extra.status !== 'valid';
            const extraLabel =
              extra.status === 'valid'
                ? ticketsCopy.detail.valid
                : extra.status === 'used'
                  ? ticketsCopy.detail.used
                  : ticketsCopy.detail.revoked;

            return (
              <View key={extra.id} style={[styles.extraCard, isUsed && styles.extraCardUsed]}>
                <Text style={[styles.extraName, isUsed && styles.textMuted]}>
                  {extra.extraName}
                </Text>
                {extra.status === 'used' ? (
                  <View
                    style={styles.extraQrUsedBox}
                    accessible={true}
                    accessibilityRole="text"
                    accessibilityLabel={ticketsCopy.detail.qrUsed}
                  >
                    <Text style={styles.qrUsedText}>{ticketsCopy.detail.qrUsed}</Text>
                  </View>
                ) : (
                  <View
                    style={styles.extraQrBox}
                    accessible={true}
                    accessibilityRole="image"
                    accessibilityLabel={`QR code for ${extra.extraName}`}
                  >
                    <QRCode value={extra.code} size={140} />
                  </View>
                )}
                <Text style={[styles.extraStatus, isUsed && styles.textMuted]}>{extraLabel}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={editing} animationType="fade" transparent onRequestClose={closeEdit}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={closeEdit} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{ticketsCopy.detail.nicknameLabel}</Text>
            <TextInput
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder={ticketsCopy.detail.nicknamePlaceholder}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              maxLength={60}
              autoFocus
              editable={!saving}
              accessibilityLabel={ticketsCopy.detail.nicknameLabel}
            />
            <Text style={styles.hintSmall}>{ticketsCopy.detail.nicknameMaxLengthHint}</Text>
            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={closeEdit}
                style={[styles.actionButton, styles.actionSecondary]}
                accessibilityRole="button"
                disabled={saving}
              >
                <Text style={styles.actionSecondaryText}>{ticketsCopy.detail.nicknameCancel}</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                style={[styles.actionButton, styles.actionPrimary, saving && styles.actionDisabled]}
                accessibilityRole="button"
                disabled={saving}
              >
                <Text style={styles.actionPrimaryText}>
                  {saving ? ticketsCopy.detail.nicknameSaving : ticketsCopy.detail.nicknameSave}
                </Text>
              </Pressable>
            </View>
            {nickname ? (
              <Pressable
                onPress={onRemove}
                style={styles.removeButton}
                accessibilityRole="button"
                disabled={saving}
              >
                <Text style={styles.removeText}>{ticketsCopy.detail.nicknameRemove}</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
    minHeight: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  header: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  subTitle: {
    color: theme.colors.muted,
    fontSize: theme.font.size.md,
    textAlign: 'center',
  },
  editButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  editButtonText: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  sub: { color: theme.colors.muted, textAlign: 'center' },
  qrBox: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: '#fff',
    borderRadius: theme.radii.md,
  },
  hint: { color: theme.colors.muted, textAlign: 'center', fontSize: theme.font.size.sm },
  hintSmall: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  status: { color: theme.colors.fg, fontWeight: '700' },
  statusMuted: { color: theme.colors.muted },
  extrasSection: {
    width: '100%',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  extrasTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '700',
  },
  extraCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  extraCardUsed: { opacity: 0.5 },
  extraName: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
  extraQrBox: {
    padding: theme.spacing.md,
    backgroundColor: '#fff',
    borderRadius: theme.radii.sm,
  },
  extraStatus: { color: theme.colors.fg, fontWeight: '600', fontSize: theme.font.size.sm },
  textMuted: { color: theme.colors.muted },
  qrUsedBox: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl + theme.spacing.lg,
    minHeight: 240 + theme.spacing.lg * 2,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 280,
  },
  extraQrUsedBox: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    minHeight: 140 + theme.spacing.md * 2,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  qrUsedText: {
    color: theme.colors.muted,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  modalTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: theme.font.size.sm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  actionButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  actionSecondary: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionSecondaryText: {
    color: theme.colors.fg,
    fontWeight: '600',
  },
  actionPrimary: {
    backgroundColor: theme.colors.fg,
  },
  actionPrimaryText: {
    color: theme.colors.bg,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.6,
  },
  removeButton: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
  },
  removeText: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
    textDecorationLine: 'underline',
  },
});
