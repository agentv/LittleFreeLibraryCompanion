/** Check-in history (design: History.dc.html): your visits, filterable, each opening the visit. */
import { router } from 'expo-router';
import { useState } from 'react';
import { SectionList, View } from 'react-native';
import { attachmentSummary, conditionShort, monthLabel, needsAttention, shortWhen } from '../features/describe';
import { attachmentsFor } from '../features/queries';
import { describeSyncNote, waitingVisitIds } from '../sync';
import { useStore } from '../services/context';
import { useMe } from '../services/useMe';
import { useTheme } from '../theme';
import { Icon } from '../ui/Icon';
import { Button, Card, Chip, Header, Screen, Text } from '../ui/kit';
import { Photo } from '../ui/Photo';

type Filter = 'all' | 'waiting' | 'issues';

export default function History() {
  const t = useTheme();
  const { me, can } = useMe();
  const [filter, setFilter] = useState<Filter>('all');

  const data = useStore((store) => {
    const waiting = waitingVisitIds(store);
    const visits = (me ? store.list('visits', { userId: me.id }) : []).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
    const rows = visits.map((v) => {
      const atts = attachmentsFor(store, v.id);
      const sync = store.syncInfo('visits', v.id);
      return {
        visit: v,
        library: store.get('libraries', v.libraryId),
        thumb: atts.find((a) => a.kind === 'photo' && a.role === 'establishing') ?? atts.find((a) => a.kind === 'photo') ?? null,
        atts,
        waiting: waiting.has(v.id),
        held: sync?.state === 'held',
        rejected: sync?.state === 'rejected' ? sync.note : null,
        issue: needsAttention(v) || !!v.flagFarFromLibrary || !!v.flagLowAccuracy || !!v.flagMocked,
      };
    });
    return { rows, libraryCount: new Set(visits.map((v) => v.libraryId)).size, total: visits.length };
  });

  const shown = data.rows.filter((r) => filter === 'all' || (filter === 'waiting' && (r.waiting || r.held)) || (filter === 'issues' && r.issue));
  const sections: { title: string; data: typeof shown }[] = [];
  for (const r of shown) {
    const title = monthLabel(r.visit.visitedAt);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(r);
    else sections.push({ title, data: [r] });
  }

  return (
    <Screen
      footer={
        can('visit.create') ? (
          <Button label="Check in now" size="lg" onPress={() => router.push('/')} />
        ) : undefined
      }
    >
      <Header title="Check-in history" />
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Text size={24} weight="extrabold">
          Your visits
        </Text>
        <Text size={14} muted style={{ marginTop: 2 }}>
          {`${data.total} check-in${data.total === 1 ? '' : 's'} at ${data.libraryCount} librar${data.libraryCount === 1 ? 'y' : 'ies'}`}
        </Text>
      </View>
      <View accessibilityRole="tablist" style={{ paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip small label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip small label="Waiting to upload" selected={filter === 'waiting'} onPress={() => setFilter('waiting')} />
        <Chip small label="Needs attention" selected={filter === 'issues'} onPress={() => setFilter('issues')} />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.visit.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderSectionHeader={({ section }) => (
          <Text size={13} weight="extrabold" muted style={{ marginBottom: 10, marginTop: 4 }}>
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          <Text muted style={{ textAlign: 'center', marginTop: 40 }}>
            {filter === 'all' ? 'No check-ins yet.' : 'Nothing here.'}
          </Text>
        }
        renderItem={({ item }) => {
          const summary = attachmentSummary(item.atts);
          const statusText = item.rejected
            ? describeSyncNote(item.rejected)
            : item.held
              ? 'Waiting for an admin to review'
              : item.waiting
                ? 'Waiting to upload'
                : `Uploaded${summary ? ` · ${summary}` : ''}`;
          const tone = item.rejected || item.held || item.waiting ? t.colors.primary : t.colors.success;
          return (
            <Card
              label={`${item.library?.name ?? 'Library'}, ${shortWhen(item.visit.visitedAt)}`}
              onPress={() => router.push({ pathname: '/visits/[id]', params: { id: item.visit.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 22 }}
            >
              <Photo attachment={item.thumb} style={{ width: 52, height: 52, borderRadius: 16 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text size={15} weight="extrabold" numberOfLines={1}>
                  {item.library?.name ?? 'Library'}
                </Text>
                <Text size={13} muted numberOfLines={1}>
                  {`${shortWhen(item.visit.visitedAt)} · ${conditionShort(item.visit)}`}
                </Text>
                <Text size={12} weight={tone === t.colors.success ? 'bold' : 'extrabold'} color={tone} numberOfLines={1}>
                  {statusText}
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
