/** Step 1 of 4 (design: W1-Photos.dc.html): Shelf → Establishing → Location, each skippable, then extras. */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useServices } from '../../services/context';
import { useTheme } from '../../theme';
import type { PhotoRole } from '../../types/models';
import { Icon } from '../../ui/Icon';
import { Button, Chip, RoundButton, StepHeader, Text } from '../../ui/kit';
import { assignRole, nextOpenRole, type CheckInDraft, type DraftPhoto } from '../checkin';
import { PHOTO_ROLES, ROLE_LABEL } from '../describe';
import { discardFile, processPhoto } from '../media';

const PROMPT: Record<PhotoRole | 'extra', { title: string; hint: string }> = {
  shelf: { title: 'Shelf photo', hint: 'Get close so the book titles are readable.' },
  establishing: { title: 'Establishing shot', hint: 'The library as you approach from the road.' },
  location: { title: 'Location photo', hint: 'The street address placard, or the street signs at the corner.' },
  extra: { title: 'Extra photos', hint: 'Anything else worth showing. Take as many as you like.' },
};

export function PhotosStep({
  draft,
  setDraft,
  libraryName,
  onChangeLibrary,
  onCancel,
  onNext,
}: {
  draft: CheckInDraft;
  setDraft: (fn: (d: CheckInDraft) => CheckInDraft) => void;
  libraryName: string;
  onChangeLibrary: () => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const t = useTheme();
  const c = t.colors.camera;
  const { newId } = useServices();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [skipped, setSkipped] = useState<PhotoRole[]>([]);
  const [role, setRole] = useState<PhotoRole | null>(() => nextOpenRole(draft.photos));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Latest photos, so several photos added in a row see each other.
  const photosRef = useRef(draft.photos);
  useEffect(() => {
    photosRef.current = draft.photos;
  }, [draft.photos]);
  const prompt = PROMPT[role ?? 'extra'];
  const last = draft.photos[draft.photos.length - 1];

  const addPhoto = async (source: { uri: string; width: number; height: number }, asRole: PhotoRole | null) => {
    const id = newId();
    const processed = await processPhoto(id, source);
    const pos = draft.position;
    const photo: DraftPhoto = {
      id,
      role: null,
      ...processed,
      capturedAt: new Date().toISOString(),
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      forComment: false,
    };
    const nextPhotos = assignRole([...photosRef.current, photo], id, asRole);
    photosRef.current = nextPhotos;
    setDraft((d) => ({ ...d, photos: nextPhotos }));
    return nextPhotos;
  };

  const shoot = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9 });
      const photos = await addPhoto(pic, role);
      setRole(nextOpenRole(photos, skipped));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't take the photo.");
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
    if (res.canceled) return;
    setBusy(true);
    try {
      let photos: DraftPhoto[] = photosRef.current;
      for (const [i, asset] of res.assets.entries()) {
        photos = await addPhoto({ uri: asset.uri, width: asset.width, height: asset.height }, i === 0 ? role : null);
      }
      setRole(nextOpenRole(photos, skipped));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add those photos.");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (!role) return onNext();
    const nextSkipped = [...skipped, role];
    setSkipped(nextSkipped);
    setRole(nextOpenRole(draft.photos, nextSkipped));
  };

  const cameraBlock = (() => {
    if (!permission) return <ActivityIndicator color={c.text} />;
    if (!permission.granted) {
      return (
        <View style={{ padding: 20, gap: 12, alignItems: 'center' }}>
          <Text size={15} weight="bold" color={c.text} style={{ textAlign: 'center' }}>
            {permission.canAskAgain ? 'Allow the camera to take photos of the library.' : 'The camera is off for this app. You can allow it in Settings, or add photos from your library.'}
          </Text>
          {permission.canAskAgain ? <Button label="Allow camera" dark onPress={() => void requestPermission()} /> : null}
        </View>
      );
    }
    return <CameraView ref={camera} style={{ flex: 1 }} facing="back" />;
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
      <StepHeader step={1} title="Photos" dark backIcon="close" onBack={onCancel} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 10, alignItems: 'center', gap: 4 }}>
        <Text size={22} weight="extrabold" color={c.text}>
          {prompt.title}
        </Text>
        <Text size={14} color={c.textMuted} style={{ textAlign: 'center' }}>
          {prompt.hint}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Library: ${libraryName}. Change library`} onPress={onChangeLibrary} hitSlop={8}>
          <Text size={13} weight="bold" color={c.accent}>
            {`At ${libraryName} · change`}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, marginHorizontal: 16, borderRadius: 32, overflow: 'hidden', backgroundColor: c.raised, justifyContent: 'center' }}>
        {cameraBlock}
        {busy ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <ActivityIndicator color={c.text} size="large" />
          </View>
        ) : null}
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 16, paddingHorizontal: 16, flexWrap: 'wrap' }}>
        {[...PHOTO_ROLES, null].map((r) => {
          const filled = r ? draft.photos.some((p) => p.role === r) : false;
          return (
            <Chip key={r ?? 'extra'} small dark label={`${r ? ROLE_LABEL[r] : 'Extra'}${filled ? ' ✓' : ''}`} selected={role === r} onPress={() => setRole(r)} />
          );
        })}
      </View>

      {error ? (
        <Text size={13} weight="bold" color={c.accent} style={{ textAlign: 'center', marginTop: 8 }}>
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 20, paddingVertical: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Photos taken this visit: ${draft.photos.length}`}
          onPress={() => draft.photos.length && setReviewOpen(true)}
          style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.raised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
        >
          {last ? <Image source={{ uri: last.thumbnailLocalUri }} style={{ width: 56, height: 56 }} /> : null}
          {draft.photos.length > 1 ? (
            <View style={{ position: 'absolute', right: 4, bottom: 4, backgroundColor: c.background, borderRadius: 8, paddingHorizontal: 5 }}>
              <Text size={11} weight="extrabold" color={c.text}>
                {draft.photos.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          disabled={!permission?.granted || busy}
          onPress={shoot}
          style={({ pressed }) => ({
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 5,
            borderColor: c.text,
            backgroundColor: c.shutter,
            opacity: !permission?.granted ? 0.4 : pressed ? 0.8 : 1,
          })}
        />
        <RoundButton icon="gallery" label="Choose from photo library" dark size={56} onPress={pick} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', gap: 10 }}>
        <Button label={role ? 'Skip this photo' : 'Done with photos'} variant="secondary" dark style={{ flex: 1 }} onPress={role ? skip : onNext} />
        <Button label="Next: Condition" dark style={{ flex: 1 }} onPress={onNext} />
      </View>

      <PhotoReview
        visible={reviewOpen}
        photos={draft.photos}
        onClose={() => setReviewOpen(false)}
        onRole={(id, r) => setDraft((d) => ({ ...d, photos: assignRole(d.photos, id, r) }))}
        onDelete={(id) =>
          setDraft((d) => {
            const p = d.photos.find((x) => x.id === id);
            discardFile(p?.localUri);
            discardFile(p?.thumbnailLocalUri);
            return { ...d, photos: d.photos.filter((x) => x.id !== id) };
          })
        }
      />
    </SafeAreaView>
  );
}

/** Photos taken this visit: pick which one fills each role, or delete. */
export function PhotoReview({
  visible,
  photos,
  onClose,
  onRole,
  onDelete,
}: {
  visible: boolean;
  photos: DraftPhoto[];
  onClose: () => void;
  onRole: (id: string, role: PhotoRole | null) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
          <Text size={20} weight="extrabold" style={{ flex: 1 }}>
            Photos this visit
          </Text>
          <RoundButton icon="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {photos.length === 0 ? <Text muted>No photos yet.</Text> : null}
          {photos.map((p) => (
            <View key={p.id} style={{ backgroundColor: t.colors.surface, borderRadius: 24, padding: 12, gap: 10 }}>
              <Image source={{ uri: p.thumbnailLocalUri }} style={{ width: '100%', height: 180, borderRadius: 16 }} resizeMode="cover" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[...PHOTO_ROLES, null].map((r) => (
                  <Chip key={r ?? 'extra'} small label={r ? ROLE_LABEL[r] : 'Extra'} selected={p.role === r} onPress={() => onRole(p.id, r)} />
                ))}
              </View>
              <Pressable accessibilityRole="button" onPress={() => onDelete(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 6 }}>
                <Icon name="trash" color={t.colors.textMuted} size={18} />
                <Text size={14} weight="bold" muted>
                  Delete photo
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
