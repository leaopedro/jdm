import type { MyTicket } from '@jdm/shared/tickets';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { listMyTickets } from '~/api/tickets';
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{ticket.event.title}</Text>
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
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  sub: { color: theme.colors.muted, textAlign: 'center' },
  qrBox: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: '#fff',
    borderRadius: theme.radii.md,
  },
  hint: { color: theme.colors.muted, textAlign: 'center', fontSize: theme.font.size.sm },
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
});
