/** Your profile (design: Profile.dc.html). Accounts are edited on the web, not here. */
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { ENV } from '../config/env';
import { addressLine } from '../features/describe';
import { MEMBER_STATUS_LABEL } from '../membership';
import { countPending } from '../sync';
import { useDeviceState, useServices, useStore } from '../services/context';
import { useMe } from '../services/useMe';
import { useTheme } from '../theme';
import { Icon } from '../ui/Icon';
import { Badge, Button, Card, Header, Screen, Text } from '../ui/kit';
import { coverPhoto } from '../features/queries';
import { Photo } from '../ui/Photo';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function deviceLine(state: ReturnType<typeof useDeviceState>, demo: boolean): { title: string; detail: string } {
  if (!state) return { title: 'Checking this phone…', detail: '' };
  if (state.status === 'trusted') {
    const d = state.trustExpiresAt ? new Date(state.trustExpiresAt) : null;
    return {
      title: 'This phone is trusted',
      detail: demo ? 'Demo mode' : d ? `Renews on its own before ${MONTHS[d.getMonth()]} ${d.getDate()}` : 'Renews on its own',
    };
  }
  if (state.status === 'pending') return { title: 'This phone is waiting for approval', detail: 'An admin approves new phones for now.' };
  if (state.status === 'revoked') return { title: 'This phone was removed', detail: 'Sign out, then sign in again to register it.' };
  return { title: 'This phone is not registered yet', detail: 'It registers the next time it has signal.' };
}

export default function Profile() {
  const t = useTheme();
  const services = useServices();
  const { me } = useMe();
  const device = useDeviceState();
  const [busy, setBusy] = useState(false);
  const data = useStore((store) => {
    if (!me) return null;
    const visits = store.list('visits', { userId: me.id });
    const visitIds = new Set(visits.map((v) => v.id));
    const libraries = store.list('libraries', { createdBy: me.id }).sort((a, b) => a.name.localeCompare(b.name));
    return {
      visits: visits.length,
      libraries,
      photos: store.list('attachments', { kind: 'photo' }).filter((a) => visitIds.has(a.visitId)).length,
      covers: Object.fromEntries(libraries.map((l) => [l.id, coverPhoto(store, l)])),
      pending: countPending(store).pending,
    };
  });
  if (!me || !data) return null;
  const line = deviceLine(device, services.demo);

  const signOut = () => {
    const go = async () => {
      setBusy(true);
      await services.signOutAndWipe();
      router.replace('/sign-in');
    };
    Alert.alert(
      'Sign out?',
      data.pending
        ? `${data.pending} item${data.pending === 1 ? ' has' : 's have'} not uploaded yet and will be deleted from this phone.`
        : 'This removes your account and this phone’s key from the app. You can sign in again any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void go() },
      ],
    );
  };

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Edit account on the web" variant="secondary" style={{ flex: 1.4 }} onPress={() => WebBrowser.openBrowserAsync(ENV.accountUrl)} />
          <Button label="Sign out" variant="outline" style={{ flex: 1 }} busy={busy} onPress={signOut} />
        </View>
      }
      scroll
    >
      <Header title="Your profile" />
      <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingTop: 10 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.colors.placeholder, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: t.colors.surface }}>
          <Text size={34} weight="extrabold" color={t.colors.onAccentSoft}>
            {me.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text size={24} weight="extrabold" style={{ marginTop: 8 }}>
          {me.displayName}
        </Text>
        <Text size={14} muted>
          {me.email}
        </Text>
        <View style={{ marginTop: 6, flexDirection: 'row', gap: 8 }}>
          <Badge label={me.role === 'admin' ? 'Admin' : 'Steward'} />
          <Badge
            tone="outline"
            label={MEMBER_STATUS_LABEL[me.status]}
            dot={me.status === 'active' ? t.colors.success : t.colors.primary}
          />
        </View>
      </View>

      <Card style={{ marginTop: 18, marginHorizontal: 20, flexDirection: 'row', paddingHorizontal: 8 }}>
        {[
          [data.visits, 'Check-ins'],
          [data.libraries.length, 'Libraries'],
          [data.photos, 'Photos'],
        ].map(([n, label]) => (
          <View key={label as string} style={{ flex: 1, alignItems: 'center' }}>
            <Text size={22} weight="extrabold">
              {String(n)}
            </Text>
            <Text size={13} muted>
              {label as string}
            </Text>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 14, marginHorizontal: 20, gap: 10 }}>
        <Text size={15} weight="extrabold">
          Libraries you added
        </Text>
        {data.libraries.length === 0 ? <Text muted>None yet.</Text> : null}
        {data.libraries.slice(0, 3).map((l) => {
          const addr = addressLine(l);
          return (
            <Card key={l.id} label={l.name} style={{ padding: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => router.push(addr ? { pathname: '/libraries/[id]', params: { id: l.id } } : { pathname: '/libraries/edit', params: { id: l.id } })}>
              <Photo attachment={data.covers[l.id]} style={{ width: 44, height: 44, borderRadius: 14 }} />
              <View style={{ flex: 1 }}>
                <Text size={15} weight="bold">
                  {l.name}
                </Text>
                {addr ? (
                  <Text size={13} muted>
                    {addr}
                  </Text>
                ) : (
                  <Text size={13} weight="bold" color={t.colors.primary}>
                    Address missing · add it
                  </Text>
                )}
              </View>
            </Card>
          );
        })}
        {data.libraries.length > 3 ? <Button label={`See all ${data.libraries.length}`} variant="link" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/libraries')} /> : null}
      </Card>

      <Card style={{ marginTop: 14, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="phone" color={t.colors.primary} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text size={15} weight="bold">
            {line.title}
          </Text>
          {line.detail ? (
            <Text size={13} muted>
              {line.detail}
            </Text>
          ) : null}
        </View>
        <Button label="Devices" variant="link" onPress={() => router.push('/devices')} />
      </Card>
    </Screen>
  );
}
