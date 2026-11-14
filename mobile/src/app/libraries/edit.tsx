/**
 * Add or edit a library. A new library needs a position (GPS or a pin on the
 * map). The steward types the street address; it can be left for later
 * (address "missing", the app reminds them). Nothing else fills it in.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { LOCATION } from '../../config/limits';
import { formatDistance, type LocationFix } from '../../location';
import { useServices, useStore } from '../../services/context';
import { useMe } from '../../services/useMe';
import { usePosition } from '../../services/usePosition';
import { useTheme } from '../../theme';
import { canEdit, type Library } from '../../types/models';
import { Button, Card, Field, Header, Screen, Text, useInputStyle } from '../../ui/kit';
import { LocationProblemCard } from '../../ui/LocationProblem';
import { MapPicker } from '../../ui/MapPicker';

type AddressFields = Pick<Library, 'addressLine' | 'city' | 'county' | 'region' | 'postalCode' | 'country'>;
const ADDRESS_KEYS: (keyof AddressFields)[] = ['addressLine', 'city', 'county', 'region', 'postalCode', 'country'];
const ADDRESS_LABELS: Record<keyof AddressFields, string> = {
  addressLine: 'Street address',
  city: 'City or town',
  county: 'County',
  region: 'State or province',
  postalCode: 'Postal code',
  country: 'Country',
};

export default function EditLibrary() {
  const t = useTheme();
  const input = useInputStyle();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { sync, newId, device } = useServices();
  const { me, can } = useMe();
  const existing = useStore((s) => (id ? s.get('libraries', id) : null));
  const isNew = !existing;
  const gps = usePosition({ auto: isNew });

  const [name, setName] = useState(existing?.name ?? '');
  const [charter, setCharter] = useState(existing?.charterNumber ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [address, setAddress] = useState<AddressFields>(() =>
    Object.fromEntries(ADDRESS_KEYS.map((k) => [k, existing?.[k] ?? ''])) as unknown as AddressFields,
  );
  const [chosen, setPosition] = useState<Pick<LocationFix, 'latitude' | 'longitude' | 'accuracyM' | 'source'> | null>(
    existing ? { latitude: existing.latitude, longitude: existing.longitude, accuracyM: existing.locationAccuracyM, source: existing.locationSource } : null,
  );
  const [mapOpen, setMapOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new library uses the GPS fix until the steward places a pin or asks again.
  const position = chosen ?? (isNew && gps.result?.ok ? gps.result.fix : null);

  const allowed = isNew ? can('library.create') : !!me && can('content.editOwn') && canEdit(me, existing!.createdBy);
  const hasAddress = useMemo(() => !!(address.addressLine ?? '').trim(), [address]);

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the library a name.');
    if (!position) return setError('The library needs a position. Try GPS again or place it on the map.');
    if (!me) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const clean = (v: string | null) => (v ?? '').trim() || null;
      const addr = Object.fromEntries(ADDRESS_KEYS.map((k) => [k, clean(address[k])])) as unknown as AddressFields;
      const addressChanged = !existing || ADDRESS_KEYS.some((k) => (existing[k] ?? null) !== addr[k]);
      const record: Library = {
        id: existing?.id ?? newId(),
        name: name.trim(),
        charterNumber: clean(charter),
        description: clean(description),
        latitude: position.latitude,
        longitude: position.longitude,
        locationAccuracyM: position.accuracyM,
        locationSource: position.source,
        ...addr,
        addressSource: hasAddress ? (addressChanged ? 'typed' : existing?.addressSource ?? 'typed') : null,
        addressStatus: hasAddress ? 'confirmed' : 'missing',
        coverPhotoId: existing?.coverPhotoId ?? null,
        createdBy: existing?.createdBy ?? me.id,
        createdOnDeviceId: existing?.createdOnDeviceId ?? (await device.getDeviceId()),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await sync.store.save('libraries', record);
      void sync.syncNow().catch(() => undefined);
      router.replace({ pathname: '/libraries/[id]', params: { id: record.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Remove this library?', 'It will be hidden for everyone. Its check-ins stay in the history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await sync.store.remove('libraries', existing.id);
          void sync.syncNow().catch(() => undefined);
          router.dismissAll();
          router.replace('/');
        },
      },
    ]);
  };

  if (!allowed) {
    return (
      <Screen>
        <Header title={isNew ? 'Add a library' : 'Edit library'} />
        <Text muted style={{ padding: 20 }}>
          {isNew ? 'Only active members can add libraries.' : 'Only the steward who added this library, or an admin, can edit it.'}
        </Text>
      </Screen>
    );
  }

  const problem = isNew && !position && gps.result && !gps.result.ok ? gps.result.problem : null;
  const lowAccuracy = position && position.source !== 'manual_pin' && (position.accuracyM ?? 0) > LOCATION.LOW_ACCURACY_M;

  return (
    <Screen footer={<Button label={isNew ? 'Save library' : 'Save changes'} size="lg" busy={saving} onPress={save} />}>
      <Header title={isNew ? 'Add a library' : 'Edit library'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Field label="Name">
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Maple Avenue Library" placeholderTextColor={t.colors.textMuted} style={input} />
          </Field>

          <Card style={{ gap: 8 }}>
            <Text size={15} weight="extrabold">
              Where it stands
            </Text>
            {position ? (
              <Text size={14} muted>
                {position.source === 'manual_pin'
                  ? 'Placed on the map.'
                  : `From this phone's location${position.accuracyM !== null ? `, accurate to about ${formatDistance(position.accuracyM)}` : ''}.`}
              </Text>
            ) : gps.busy ? (
              <Text size={14} muted>
                Finding your position…
              </Text>
            ) : null}
            {problem ? <LocationProblemCard problem={problem} onRetry={() => void gps.refresh()} onPlaceOnMap={() => setMapOpen(true)} hide={['continue']} /> : null}
            {lowAccuracy ? <LocationProblemCard problem="low_accuracy" onRetry={() => void gps.refresh()} onPlaceOnMap={() => setMapOpen(true)} hide={['continue']} /> : null}
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              <Button label={position ? 'Adjust on map' : 'Place on map'} variant="link" onPress={() => setMapOpen(true)} />
              {isNew ? <Button label="Use my location" variant="link" busy={gps.busy} onPress={() => void gps.refresh().then((r) => r.ok && setPosition(r.fix))} /> : null}
            </View>
          </Card>

          <Card style={{ gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Text size={15} weight="extrabold">
                Street address
              </Text>
              <Text size={13} muted>
                {"You're the one who knows it, so type it in. You can save without it and add it later."}
              </Text>
            </View>
            {ADDRESS_KEYS.map((k) => (
              <Field key={k} label={ADDRESS_LABELS[k]}>
                <TextInput
                  value={address[k] ?? ''}
                  onChangeText={(v) => setAddress((a) => ({ ...a, [k]: v }))}
                  placeholderTextColor={t.colors.textMuted}
                  style={input}
                  autoCapitalize={k === 'postalCode' ? 'characters' : 'words'}
                />
              </Field>
            ))}
            {!isNew && existing?.addressStatus === 'confirmed' ? (
              <Text size={13} muted>
                If you change a confirmed address, an admin checks the new one before it replaces the old.
              </Text>
            ) : null}
          </Card>

          <Field label="Charter number (optional)">
            <TextInput value={charter ?? ''} onChangeText={setCharter} placeholderTextColor={t.colors.textMuted} style={input} />
          </Field>
          <Field label="Description (optional)">
            <TextInput value={description ?? ''} onChangeText={setDescription} multiline style={[input, { minHeight: 80, textAlignVertical: 'top' }]} />
          </Field>

          {error ? (
            <Text size={14} weight="bold" color={t.colors.danger}>
              {error}
            </Text>
          ) : null}
          {!isNew ? <Button label="Remove this library" variant="outline" onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <MapPicker
        visible={mapOpen}
        initial={position ?? gps.fix}
        onCancel={() => setMapOpen(false)}
        onPick={(p) => {
          setPosition({ ...p, accuracyM: null, source: 'manual_pin' });
          setMapOpen(false);
        }}
      />
    </Screen>
  );
}
