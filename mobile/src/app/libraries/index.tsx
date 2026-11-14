/** Pick a library: every library, nearest first (everyone signed in can see all of them). */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { addressLine, conditionShort, relativeDay } from '../../features/describe';
import { coverPhoto, latestVisit } from '../../features/queries';
import { distanceM, formatDistance } from '../../location';
import { useStore } from '../../services/context';
import { useMe } from '../../services/useMe';
import { usePosition } from '../../services/usePosition';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Button, Card, Header, Screen, Text, useInputStyle } from '../../ui/kit';
import { Photo } from '../../ui/Photo';

export default function Libraries() {
  const t = useTheme();
  const input = useInputStyle();
  const { can } = useMe();
  const { fix } = usePosition();
  const [query, setQuery] = useState('');

  const rows = useStore((store) =>
    store
      .list('libraries')
      .map((library) => ({
        library,
        distance: fix ? distanceM(fix, library) : null,
        last: latestVisit(store, library.id),
        cover: coverPhoto(store, library),
      }))
      .filter((r) => {
        const q = query.trim().toLowerCase();
        return !q || r.library.name.toLowerCase().includes(q) || (r.library.addressLine ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.library.name.localeCompare(b.library.name)),
  );

  return (
    <Screen
      footer={can('library.create') ? <Button label="Add a library" icon="plus" size="lg" onPress={() => router.push('/libraries/edit')} /> : undefined}
    >
      <Header title="Libraries" />
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or street" placeholderTextColor={t.colors.textMuted} style={input} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.library.id}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text muted style={{ textAlign: 'center', marginTop: 40 }}>
            {query ? 'No library matches that.' : 'No libraries yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const addr = addressLine(item.library);
          return (
            <Card
              label={item.library.name}
              onPress={() => router.push({ pathname: '/libraries/[id]', params: { id: item.library.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
            >
              <Photo attachment={item.cover} style={{ width: 52, height: 52, borderRadius: 16 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text size={15} weight="extrabold" numberOfLines={1}>
                  {item.library.name}
                </Text>
                <Text size={13} muted numberOfLines={1}>
                  {[item.distance !== null ? `${formatDistance(item.distance)} away` : null, addr].filter(Boolean).join(' · ') || ' '}
                </Text>
                {addr ? null : (
                  <Text size={12} weight="bold" color={t.colors.primary}>
                    Address needed
                  </Text>
                )}
                <Text size={12} muted numberOfLines={1}>
                  {item.last ? `Checked ${relativeDay(item.last.visitedAt)} · ${conditionShort(item.last)}` : 'No check-ins yet'}
                </Text>
              </View>
              <Icon name="chevron" color={t.colors.textMuted} size={18} />
            </Card>
          );
        }}
      />
    </Screen>
  );
}
