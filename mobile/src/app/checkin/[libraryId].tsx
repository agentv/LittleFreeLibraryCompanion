/**
 * Check-in wizard (locked 2026-11-09): 1 Photos → 2 Condition (optional) →
 * 3 Notes (optional) → 4 Review and finish. Never blocks on location: the
 * position is fetched in the background and the visit saves without it.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, FlatList, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LOCATION } from '../../config/limits';
import { draftToRecords, newDraft, type CheckInDraft } from '../../features/checkin';
import { ConditionStep } from '../../features/checkin-ui/ConditionStep';
import { NotesStep } from '../../features/checkin-ui/NotesStep';
import { PhotosStep } from '../../features/checkin-ui/PhotosStep';
import { ReviewStep } from '../../features/checkin-ui/ReviewStep';
import { discardFile } from '../../features/media';
import { distanceM, formatDistance } from '../../location';
import { useServices, useStore, useSyncStatus } from '../../services/context';
import { useMe } from '../../services/useMe';
import { useTheme } from '../../theme';
import { Card, Loading, RoundButton, Text } from '../../ui/kit';

type Step = 1 | 2 | 3 | 4;

export default function CheckIn() {
  const t = useTheme();
  const params = useLocalSearchParams<{ libraryId: string; step?: string }>();
  const services = useServices();
  const { me, can } = useMe();
  const status = useSyncStatus();
  const [draft, setDraftState] = useState<CheckInDraft>(() => newDraft(services.newId, params.libraryId));
  const [step, setStep] = useState<Step>(params.step === 'notes' ? 3 : 1);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const setDraft = (fn: (d: CheckInDraft) => CheckInDraft) => setDraftState(fn);

  const library = useStore((s) => s.get('libraries', draft.libraryId));
  const libraries = useStore((s) => s.list('libraries'));

  // Position in the background; the check-in never waits for it.
  useEffect(() => {
    let live = true;
    services.location
      .getFix({ timeoutMs: LOCATION.FIX_TIMEOUT_MS, desiredAccuracyM: LOCATION.DESIRED_ACCURACY_M })
      .then((r) => {
        const fix = r.ok ? r.fix : r.bestEffort;
        if (live && fix) setDraftState((d) => ({ ...d, position: fix }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [services.location]);

  const hasWork = draft.photos.length > 0 || !!draft.audio || !!draft.comment.trim() || !!draft.stockLevel || !!draft.condition || draft.doorOk !== null || draft.itemsRemoved !== null;

  const cancel = () => {
    const leave = () => {
      for (const p of draft.photos) {
        discardFile(p.localUri);
        discardFile(p.thumbnailLocalUri);
      }
      discardFile(draft.audio?.localUri);
      router.back();
    };
    if (!hasWork) return leave();
    Alert.alert('Discard this check-in?', 'The photos and notes you added will be deleted.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1) setStep((s) => (s - 1) as Step);
      else cancel();
      return true;
    });
    return () => sub.remove();
  });

  const finish = async () => {
    if (!me) return;
    setSaving(true);
    try {
      const deviceId = await services.device.getDeviceId();
      const records = draftToRecords(draft, { userId: me.id, deviceId });
      await services.sync.store.saveAll(records);
      void services.sync.syncNow().catch(() => undefined);
      router.replace({ pathname: '/libraries/[id]', params: { id: draft.libraryId } });
    } catch (e) {
      Alert.alert("Couldn't save the check-in", e instanceof Error ? e.message : 'Please try again.');
      setSaving(false);
    }
  };

  if (!me) return <Loading />;
  if (!can('visit.create')) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 20, gap: 12, backgroundColor: t.colors.background }}>
        <RoundButton icon="close" label="Close" onPress={() => router.back()} />
        <Text size={20} weight="extrabold">
          Check-ins open once an admin approves your account.
        </Text>
      </SafeAreaView>
    );
  }

  const libraryName = library?.name ?? 'this library';
  const pos = draft.position;
  const sorted = [...libraries].sort((a, b) => (pos ? distanceM(pos, a) - distanceM(pos, b) : a.name.localeCompare(b.name)));

  return (
    <View style={{ flex: 1 }}>
      {step === 1 ? (
        <PhotosStep draft={draft} setDraft={setDraft} libraryName={libraryName} onChangeLibrary={() => setPicking(true)} onCancel={cancel} onNext={() => setStep(2)} />
      ) : step === 2 ? (
        <ConditionStep draft={draft} setDraft={setDraft} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      ) : step === 3 ? (
        <NotesStep draft={draft} setDraft={setDraft} onBack={() => setStep(2)} onNext={() => setStep(4)} />
      ) : (
        <ReviewStep
          draft={draft}
          libraryName={libraryName}
          onBack={() => setStep(3)}
          onEdit={(s) => setStep(s)}
          onFinish={finish}
          saving={saving}
          pausedReason={status.pausedReason}
        />
      )}

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <Text size={20} weight="extrabold" style={{ flex: 1 }}>
              Which library?
            </Text>
            <RoundButton icon="close" label="Close" onPress={() => setPicking(false)} />
          </View>
          <FlatList
            data={sorted}
            keyExtractor={(l) => l.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <Card
                label={item.name}
                onPress={() => {
                  setDraftState((d) => ({ ...d, libraryId: item.id }));
                  setPicking(false);
                }}
                style={item.id === draft.libraryId ? { borderWidth: 2, borderColor: t.colors.primary } : undefined}
              >
                <Text size={15} weight="extrabold">
                  {item.name}
                </Text>
                {pos ? (
                  <Text size={13} muted>
                    {`${formatDistance(distanceM(pos, item))} away`}
                  </Text>
                ) : null}
              </Card>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
