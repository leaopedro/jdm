import type { MyTicket } from '@jdm/shared/tickets';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { listMyTickets } from '~/api/tickets';
import { ticketsCopy } from '~/copy/tickets';
import { formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

export default function TicketDetail() {
  useKeepAwake();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<MyTicket | null>(null);

  useEffect(() => {
    void (async () => {
      const { items } = await listMyTickets();
      setTicket(items.find((t) => t.id === ticketId) ?? null);
    })();
  }, [ticketId]);

  if (!ticket) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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
    <View style={styles.container}>
      <Text style={styles.title}>{ticket.event.title}</Text>
      <Text style={styles.sub}>
        {formatEventDateRange(ticket.event.startsAt, ticket.event.endsAt)}
      </Text>
      <Text style={styles.sub}>{ticket.tierName}</Text>

      <View style={styles.qrBox}>
        <QRCode value={ticket.code} size={240} />
      </View>
      <Text style={styles.hint}>{ticketsCopy.detail.brightness}</Text>
      <Text style={[styles.status, ticket.status !== 'valid' && styles.statusMuted]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
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
});
