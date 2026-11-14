/** Library card (design: Main.dc.html): photo, distance, address, last condition, today's three photos, check in. */
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addressLine, conditionSentence, daysAgo, PHOTO_ROLES, relativeDay, ROLE_LABEL } from '../../features/describe';
import { coverPhoto, latestConditionVisit, latestRolePhoto, visitsFor } from '../../features/queries';
import { distanceM, formatDistance } from '../../location';
import { canEdit } from '../../types/models';
import { useStore } from '../../services/context';
import { useMe } from '../../services/useMe';
import { usePosition } from '../../services/usePosition';
import { useTheme } from '../../theme';
import { Icon, type IconName } from '../../ui/Icon';
import { Banner, Button, Card, RoundButton, Text } from '../../ui/kit';
import { Photo } from '../../ui/Photo';

const ROLE_ICON: Record<string, IconName> = { shelf: 'shelf', establishing: 'establishing', location: 'location' };

export default function LibraryCard() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useMe();
  const { fix } = usePosition();
  const data = useStore((store) => {
    const library = store.get('libraries', id);
    if (!library || library.deletedAt) return null;
    const today = new Date().toDateString();
    const todaysVisit = visitsFor(store, id).find((v) => v.userId === me?.id && new Date(v.visitedAt).toDateString() === today);
    return {
      library,
      flagged: store.syncInfo('libraries', id)?.state === 'flagged',
      cover: coverPhoto(store, library),
      lastCondition: latestConditionVisit(store, id),
      visitCount: visitsFor(store, id).length,
      roles: PHOTO_ROLES.map((role) => ({
        role,
        today: todaysVisit ? store.list('attachments', { visitId: todaysVisit.id, role })[0] ?? null : null,
        latest: latestRolePhoto(store, id, role),
      })),
    };
  });

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background, padding: 20, gap: 12 }}>
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        <Text size={20} weight="extrabold">
          {"This library isn't on this phone."}
        </Text>
      </SafeAreaView>
    );
  }
  const { library, cover, lastCondition } = data;
  const addr = addressLine(library);
  const editable = me ? can('content.editOwn') && canEdit(me, library.createdBy) : false;
  const start = (step?: string) =>
    can('visit.create') &&
    router.push({ pathname: '/checkin/[libraryId]', params: step ? { libraryId: library.id, step } : { libraryId: library.id } });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ height: 300, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', backgroundColor: t.colors.placeholder }}>
          <Photo attachment={cover} thumbnail={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} placeholder="No establishing shot yet" />
          <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <RoundButton icon="list" label="Switch library" onPress={() => router.replace('/libraries')} />
            {editable ? (
              <RoundButton icon="more" label="Edit library" onPress={() => router.push({ pathname: '/libraries/edit', params: { id: library.id } })} />
            ) : (
              <View />
            )}
          </SafeAreaView>
        </View>

        <View style={[{ marginTop: -44, marginHorizontal: 20, backgroundColor: t.colors.surface, borderRadius: 24, padding: 16, paddingHorizontal: 18, gap: 2 }, t.shadow]}>
          {fix ? (
            <Text size={13} weight="bold" color={t.colors.primary}>
              {`You're ${formatDistance(distanceM(fix, library))} away`}
            </Text>
          ) : null}
          <Text size={24} weight="extrabold">
            {library.name}
          </Text>
          {addr ? (
            <Text size={14} muted>
              {addr}
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!editable}
              onPress={() => router.push({ pathname: '/libraries/edit', params: { id: library.id } })}
            >
              <Text size={14} weight="bold" color={t.colors.primary}>
                {editable ? 'Address missing · add it' : 'Address missing'}
              </Text>
            </Pressable>
          )}
        </View>

        {data.flagged ? (
          <Banner icon="shield" style={{ marginTop: 14, marginHorizontal: 20 }}>
            The new address is waiting for an admin, because it differs from the one on record.
          </Banner>
        ) : null}

        <Card style={{ marginTop: 14, marginHorizontal: 20, backgroundColor: t.colors.accentSoft, paddingVertical: 12 }}>
          <Text size={15} color={t.colors.onAccentSoft} style={{ lineHeight: 21 }}>
            {lastCondition ? (
              <>
                <Text size={15} weight="extrabold" color={t.colors.onAccentSoft}>
                  {daysAgo(lastCondition.visitedAt) === 0 ? 'Today' : relativeDay(lastCondition.visitedAt).replace(/^\w/, (c) => c.toUpperCase())}
                </Text>
                {` ${conditionSentence(lastCondition).replace(/^\w/, (c) => c.toLowerCase())}`}
              </>
            ) : (
              'No condition check yet. The first check-in will tell everyone how it looks.'
            )}
          </Text>
        </Card>

        <View style={{ marginTop: 16, marginHorizontal: 20, gap: 10 }}>
          <Text size={15} weight="extrabold">
            {"Today's three photos"}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {data.roles.map((r) => (
              <View key={r.role} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                {r.today ? (
                  <Photo attachment={r.today} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: t.colors.primary }} />
                ) : (
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderColor: t.colors.dashed,
                      backgroundColor: t.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={ROLE_ICON[r.role]!} color={t.colors.primary} size={24} />
                  </View>
                )}
                <Text size={13} weight="bold">
                  {ROLE_LABEL[r.role]}
                </Text>
              </View>
            ))}
          </View>
          <Text size={13} muted style={{ textAlign: 'center' }}>
            {`${data.visitCount} check-in${data.visitCount === 1 ? '' : 's'} here so far`}
          </Text>
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RoundButton icon="mic" label="Record voice note" size={56} onPress={() => start('notes')} />
        <Button label="Check in here" size="lg" style={{ flex: 1 }} disabled={!can('visit.create')} onPress={() => start()} />
        <RoundButton icon="note" label="Write a note" size={56} onPress={() => start('notes')} />
      </SafeAreaView>
    </View>
  );
}
