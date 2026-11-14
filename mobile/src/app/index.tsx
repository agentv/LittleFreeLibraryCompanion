/** Welcome / home (design: Home.dc.html). */
import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { conditionShort, greeting, relativeDay } from '../features/describe';
import { coverPhoto, latestVisit } from '../features/queries';
import { distanceM, formatDistance } from '../location';
import { MEMBER_STATUS_LABEL } from '../membership';
import { useSession, useStore } from '../services/context';
import { useMe } from '../services/useMe';
import { usePosition } from '../services/usePosition';
import { useTheme } from '../theme';
import type { Library } from '../types/models';
import { Icon, type IconName } from '../ui/Icon';
import { Button, Card, Loading, Screen, Text } from '../ui/kit';
import { Photo } from '../ui/Photo';
import { SyncBanner } from '../ui/StatusBanner';

function Tile({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { flex: 1, height: 112, borderRadius: 24, backgroundColor: t.colors.surface, padding: 16, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 },
        t.shadow,
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={t.colors.primary} />
      </View>
      <View>
        <Text size={16} weight="extrabold">
          {title}
        </Text>
        <Text size={13} muted>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const t = useTheme();
  const session = useSession();
  const { me, can } = useMe();
  const { fix } = usePosition();

  const data = useStore((store) => {
    const libraries = store.list('libraries');
    const myVisits = me ? store.list('visits', { userId: me.id }) : [];
    let nearest: { library: Library; distance: number | null } | null = null;
    if (fix) {
      for (const l of libraries) {
        const d = distanceM(fix, l);
        if (!nearest || (nearest.distance !== null && d < nearest.distance)) nearest = { library: l, distance: d };
      }
    }
    if (!nearest && libraries.length) {
      // No position yet: the library you visited most recently.
      const last = [...myVisits].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))[0];
      const lib = (last && libraries.find((l) => l.id === last.libraryId)) ?? libraries[0]!;
      nearest = { library: lib, distance: null };
    }
    const last = nearest ? latestVisit(store, nearest.library.id) : null;
    const cover = nearest ? coverPhoto(store, nearest.library) : null;
    return { nearest, last, cover, myVisitCount: myVisits.length, libraryCount: new Set(myVisits.map((v) => v.libraryId)).size };
  });

  if (session === undefined) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;
  const member = me!;
  const canCheckIn = can('visit.create');
  const { nearest, last, cover } = data;

  return (
    <Screen scroll style={{ paddingHorizontal: 20 }}>
      <View style={{ paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text size={15} weight="bold" muted>
            {greeting()}
          </Text>
          <Text size={28} weight="extrabold">
            {member.displayName.split(' ')[0]}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          onPress={() => router.push('/profile')}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: t.colors.placeholder,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: t.colors.surface,
          }}
        >
          <Text size={18} weight="extrabold" color={t.colors.onAccentSoft}>
            {member.displayName.charAt(0).toUpperCase()}
          </Text>
        </Pressable>
      </View>

      <View style={[{ marginTop: 20, backgroundColor: t.colors.surface, borderRadius: 28, overflow: 'hidden' }, t.shadow]}>
        {nearest ? (
          <>
            <Photo attachment={cover} style={{ height: 150, width: '100%' }} placeholder="No establishing shot yet" />
            <View style={{ padding: 18, paddingTop: 16, gap: 2 }}>
              <Text size={13} weight="bold" color={t.colors.primary}>
                {nearest.distance !== null ? `Nearest library · ${formatDistance(nearest.distance)} away` : 'Your last library'}
              </Text>
              <Text size={22} weight="extrabold">
                {nearest.library.name}
              </Text>
              <Text size={14} muted>
                {last ? `Last check-in ${relativeDay(last.visitedAt)} · ${conditionShort(last).toLowerCase()}` : 'No check-ins yet'}
              </Text>
              <Button
                label="Check in now"
                size="xl"
                icon="camera"
                style={{ marginTop: 14 }}
                disabled={!canCheckIn}
                onPress={() => router.push({ pathname: '/checkin/[libraryId]', params: { libraryId: nearest.library.id } })}
              />
              <Button label="Not this one? Pick a library" variant="link" onPress={() => router.push('/libraries')} />
            </View>
          </>
        ) : (
          <View style={{ padding: 18, gap: 8 }}>
            <Text size={22} weight="extrabold">
              No libraries yet
            </Text>
            <Text size={14} muted>
              Add the library you look after to start checking in.
            </Text>
            <Button label="Add a library" size="lg" icon="plus" disabled={!can('library.create')} onPress={() => router.push('/libraries/edit')} />
            <Button label="See all libraries" variant="link" onPress={() => router.push('/libraries')} />
          </View>
        )}
      </View>

      {!canCheckIn ? (
        <Card style={{ marginTop: 12, backgroundColor: t.colors.accentSoft }}>
          <Text size={14} weight="semibold" color={t.colors.onAccentSoft}>
            {member.status === 'pending'
              ? 'Your account is waiting for an admin to approve it. You can look around in the meantime.'
              : 'Your account is suspended, so you can look around but not check in.'}
          </Text>
        </Card>
      ) : null}

      <View style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
        <Tile icon="clock" title="Check-in history" subtitle={`${data.myVisitCount} visit${data.myVisitCount === 1 ? '' : 's'}`} onPress={() => router.push('/history')} />
        <Tile
          icon="person"
          title="Your profile"
          subtitle={`${member.role === 'admin' ? 'Admin' : 'Steward'} · ${MEMBER_STATUS_LABEL[member.status].toLowerCase().replace(' member', '')}`}
          onPress={() => router.push('/profile')}
        />
      </View>
      {member.role === 'admin' && member.status === 'active' ? (
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
          <Tile icon="shield" title="Admin" subtitle="Members, phones, review" onPress={() => router.push('/admin')} />
          <Tile icon="list" title="All libraries" subtitle="Browse and add" onPress={() => router.push('/libraries')} />
        </View>
      ) : null}

      <View style={{ marginTop: 20 }}>
        <SyncBanner />
      </View>
    </Screen>
  );
}
