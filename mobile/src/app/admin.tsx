/**
 * Admin tools (admins only): approve members, approve phones (every phone is
 * pending until Apple/Google attestation exists), and resolve the review
 * queue (held changes and address conflicts). Uses the backend's admin API.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, TextInput, View } from 'react-native';
import type { Member, ReviewItem } from '../membership';
import { useServices } from '../services/context';
import { useMe } from '../services/useMe';
import { useTheme } from '../theme';
import type { Device } from '../types/models';
import { Badge, Button, Card, Chip, Header, Screen, Text, useInputStyle } from '../ui/kit';

type Tab = 'members' | 'devices' | 'review';

function describeReview(item: ReviewItem, members: Map<string, Member>): { title: string; detail: string } {
  const who = members.get(item.memberId)?.displayName ?? 'A member';
  const p = item.payload as Record<string, unknown>;
  if (item.kind === 'address_conflict') {
    const fmt = (a: unknown) => {
      const o = (a ?? {}) as Record<string, unknown>;
      return [o.addressLine, o.city, o.region, o.postalCode].filter(Boolean).join(', ') || '(no address)';
    };
    return { title: `${who} proposed a new address`, detail: `On record: ${fmt(p.current)}\nProposed: ${fmt(p.proposed)}` };
  }
  const what = { libraries: 'a library', visits: 'a check-in', comments: 'a comment', attachments: 'a photo or voice note' }[item.table];
  const name = typeof p.name === 'string' ? ` "${p.name}"` : typeof p.body === 'string' ? `: "${String(p.body).slice(0, 60)}"` : '';
  return { title: `${who} sent ${what}${name}`, detail: `Held because the phone was ${item.reason?.replace(/^device_/, '').replace(/_/g, ' ') ?? 'not trusted'}.` };
}

export default function Admin() {
  const t = useTheme();
  const input = useInputStyle();
  const { directory, sync } = useServices();
  const { me } = useMe();
  const [tab, setTab] = useState<Tab>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspendFor, setSuspendFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const fetchAll = useCallback(
    () =>
      Promise.all([directory.listMembers(), directory.listDevices({ status: 'pending' }), directory.listReview()]).then(
        ([m, d, r]) => {
          setMembers(m);
          setDevices(d);
          setReview(r);
          setError(null);
          setLoading(false);
        },
        (e: unknown) => {
          setError(e instanceof Error ? e.message : "Couldn't load admin data. Admin tools need a trusted phone and a connection.");
          setLoading(false);
        },
      ),
    [directory],
  );
  const load = useCallback(() => {
    setLoading(true);
    return fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
      void sync.syncNow().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  };

  if (me?.role !== 'admin') {
    return (
      <Screen>
        <Header title="Admin" />
        <Text muted style={{ padding: 20 }}>
          Admins only.
        </Text>
      </Screen>
    );
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  const pendingMembers = members.filter((m) => m.status === 'pending');
  const sortedMembers = [...pendingMembers, ...members.filter((m) => m.status !== 'pending')];

  const memberRow = (m: Member) => (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text size={15} weight="extrabold">
            {m.displayName}
          </Text>
          <Text size={13} muted>
            {m.email}
          </Text>
        </View>
        <Badge tone="outline" label={m.status === 'active' ? (m.role === 'admin' ? 'Admin' : 'Active') : m.status === 'pending' ? 'Pending' : 'Suspended'} />
      </View>
      {m.statusReason ? (
        <Text size={13} muted>
          {`Reason: ${m.statusReason}`}
        </Text>
      ) : null}
      {suspendFor === m.id ? (
        <View style={{ gap: 8 }}>
          <TextInput value={reason} onChangeText={setReason} placeholder="Why? (the member sees this)" placeholderTextColor={t.colors.textMuted} style={input} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setSuspendFor(null)} />
            <Button
              label="Suspend"
              style={{ flex: 1 }}
              disabled={!reason.trim()}
              onPress={() =>
                void act(async () => {
                  await directory.suspend(m.id, reason.trim());
                  setSuspendFor(null);
                  setReason('');
                })
              }
            />
          </View>
        </View>
      ) : m.id !== me.id ? (
        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
          {m.status !== 'active' ? <Button label="Approve" variant="link" onPress={() => void act(() => directory.approve(m.id))} /> : null}
          {m.status !== 'suspended' ? <Button label="Suspend" variant="link" onPress={() => setSuspendFor(m.id)} /> : null}
          {m.status === 'active' ? (
            <Button
              label={m.role === 'admin' ? 'Make steward' : 'Make admin'}
              variant="link"
              onPress={() =>
                Alert.alert(m.role === 'admin' ? 'Make this admin a steward?' : 'Make this member an admin?', 'Admins can edit anything and approve people and phones.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Yes', onPress: () => void act(() => directory.setRole(m.id, m.role === 'admin' ? 'steward' : 'admin')) },
                ])
              }
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );

  const deviceRow = (d: Device) => (
    <Card style={{ gap: 6 }}>
      <Text size={15} weight="extrabold">
        {`${d.model ?? (d.platform === 'ios' ? 'iPhone' : 'Android phone')} · ${byId.get(d.memberId)?.displayName ?? 'Unknown member'}`}
      </Text>
      <Text size={13} muted>
        {`Registered ${new Date(d.registeredAt).toLocaleString()} · attestation ${d.attestation} · app ${d.appVersion}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Button label="Approve" variant="link" onPress={() => void act(() => directory.approveDevice(d.id))} />
        <Button label="Remove" variant="link" onPress={() => void act(() => directory.revokeDevice(d.id))} />
      </View>
    </Card>
  );

  const reviewRow = (r: ReviewItem) => {
    const d = describeReview(r, byId);
    return (
      <Card style={{ gap: 6 }}>
        <Text size={15} weight="extrabold">
          {d.title}
        </Text>
        <Text size={13} muted>
          {d.detail}
        </Text>
        <Text size={12} muted>
          {new Date(r.createdAt).toLocaleString()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Button label={r.kind === 'address_conflict' ? 'Use new address' : 'Accept'} variant="link" onPress={() => void act(() => directory.acceptReview(r.id))} />
          <Button label={r.kind === 'address_conflict' ? 'Keep current' : 'Reject'} variant="link" onPress={() => void act(() => directory.rejectReview(r.id))} />
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <Header title="Admin" />
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip small label={`Members${pendingMembers.length ? ` (${pendingMembers.length})` : ''}`} selected={tab === 'members'} onPress={() => setTab('members')} />
        <Chip small label={`Phones${devices.length ? ` (${devices.length})` : ''}`} selected={tab === 'devices'} onPress={() => setTab('devices')} />
        <Chip small label={`Review${review.length ? ` (${review.length})` : ''}`} selected={tab === 'review'} onPress={() => setTab('review')} />
      </View>
      {error ? (
        <Text size={14} weight="bold" color={t.colors.danger} style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          {error}
        </Text>
      ) : null}
      {tab === 'members' ? (
        <FlatList
          data={sortedMembers}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => memberRow(item)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={{ padding: 20, gap: 10 }}
          ListEmptyComponent={<Text muted>No members.</Text>}
        />
      ) : tab === 'devices' ? (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => deviceRow(item)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={{ padding: 20, gap: 10 }}
          ListEmptyComponent={<Text muted>No phones waiting for approval.</Text>}
        />
      ) : (
        <FlatList
          data={review}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => reviewRow(item)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={{ padding: 20, gap: 10 }}
          ListEmptyComponent={<Text muted>Nothing waiting for review.</Text>}
        />
      )}
    </Screen>
  );
}
