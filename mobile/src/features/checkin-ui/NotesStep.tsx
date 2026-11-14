/** Step 3 of 4 (design: W3-Notes.dc.html): a voice note (90 s cap, countdown in the last 10 s) and a written comment with photos. */
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_VOICE_NOTE_SECONDS, VOICE_NOTE_COUNTDOWN_SECONDS } from '../../config/limits';
import { useServices } from '../../services/context';
import { useTheme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Button, StepHeader, Text, useInputStyle } from '../../ui/kit';
import type { CheckInDraft, DraftPhoto } from '../checkin';
import { durationLabel } from '../describe';
import { audioMimeType, discardFile, keepAudio, processPhoto } from '../media';

const BARS = [10, 18, 24, 14, 20, 8, 16, 22, 12, 18, 10, 20, 14];

export function NotesStep({
  draft,
  setDraft,
  onBack,
  onNext,
}: {
  draft: CheckInDraft;
  setDraft: (fn: (d: CheckInDraft) => CheckInDraft) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTheme();
  const input = useInputStyle();
  const { newId } = useServices();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(draft.audio?.localUri ?? null);
  const playing = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);
  const stopping = useRef(false);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (autoStop.current) clearTimeout(autoStop.current);
    },
    [],
  );

  const elapsed = rec.durationMillis / 1000;
  const remaining = Math.max(0, MAX_VOICE_NOTE_SECONDS - elapsed);

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (autoStop.current) clearTimeout(autoStop.current);
    autoStop.current = null;
    try {
      const duration = recorder.getStatus().durationMillis / 1000;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording was not saved.');
      const id = newId();
      const kept = keepAudio(id, uri);
      setDraft((d) => ({
        ...d,
        audio: {
          id,
          localUri: kept.localUri,
          sizeBytes: kept.sizeBytes,
          mimeType: audioMimeType(kept.localUri),
          durationS: Math.min(duration, MAX_VOICE_NOTE_SECONDS),
          capturedAt: new Date().toISOString(),
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the voice note.");
    } finally {
      stopping.current = false;
    }
  };

  const record = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setError('Allow the microphone in Settings to record a voice note.');
    if (draft.audio) deleteAudio();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: MAX_VOICE_NOTE_SECONDS });
    // Stops on its own at 90 seconds; the timer also saves the file.
    autoStop.current = setTimeout(() => void stop(), MAX_VOICE_NOTE_SECONDS * 1000);
  };

  const deleteAudio = () => {
    player.pause();
    setDraft((d) => {
      discardFile(d.audio?.localUri);
      return { ...d, audio: null };
    });
  };

  const togglePlay = () => {
    if (playing.playing) return player.pause();
    if (playing.didJustFinish || (playing.duration > 0 && playing.currentTime >= playing.duration - 0.1)) void player.seekTo(0);
    player.play();
  };

  const commentPhotos = draft.photos.filter((p) => p.forComment);

  const addCommentPhoto = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const res = perm.granted
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    try {
      const id = newId();
      const processed = await processPhoto(id, { uri: asset.uri, width: asset.width, height: asset.height });
      const photo: DraftPhoto = {
        id,
        role: null,
        ...processed,
        capturedAt: new Date().toISOString(),
        latitude: draft.position?.latitude ?? null,
        longitude: draft.position?.longitude ?? null,
        forComment: true,
      };
      setDraft((d) => ({ ...d, photos: [...d.photos, photo] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the photo.");
    }
  };

  const countdown = rec.isRecording && remaining <= VOICE_NOTE_COUNTDOWN_SECONDS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top', 'bottom']}>
      <StepHeader step={3} title="Notes (optional)" onBack={onBack} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 14, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text size={24} weight="extrabold">
              Anything to add?
            </Text>
            <Text size={14} muted style={{ marginTop: 2 }}>
              Optional. Talk or type, or skip this step.
            </Text>
          </View>

          <View accessibilityLabel="Voice note" style={{ backgroundColor: t.colors.surface, borderRadius: 24, padding: 18, paddingHorizontal: 16, alignItems: 'center', gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={rec.isRecording ? 'Stop recording' : 'Record voice note'}
              onPress={rec.isRecording ? stop : record}
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: t.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 8,
                borderColor: t.colors.accentSoft,
              }}
            >
              <Icon name={rec.isRecording ? 'stop' : 'mic'} color={t.colors.onPrimary} size={34} strokeWidth={1.8} />
            </Pressable>
            <Text size={14} weight="bold" muted={!countdown} color={countdown ? t.colors.primary : undefined} accessibilityLiveRegion="polite">
              {rec.isRecording
                ? countdown
                  ? `Stopping in ${Math.ceil(remaining)} s`
                  : `Recording ${durationLabel(elapsed)} · tap to stop`
                : draft.audio
                  ? 'Tap to record again'
                  : `Tap to record a voice note (up to ${MAX_VOICE_NOTE_SECONDS} s)`}
            </Text>
            {draft.audio && !rec.isRecording ? (
              <View style={{ alignSelf: 'stretch', height: 52, borderRadius: 26, backgroundColor: t.colors.background, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingRight: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing.playing ? 'Pause voice note' : 'Play voice note'}
                  onPress={togglePlay}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.text, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name={playing.playing ? 'pause' : 'play'} color={t.colors.surface} size={16} />
                </Pressable>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityElementsHidden>
                  {BARS.map((h, i) => {
                    const played = playing.duration > 0 && i / BARS.length < playing.currentTime / playing.duration;
                    return <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: played ? t.colors.primary : t.colors.dashed }} />;
                  })}
                </View>
                <Text size={13} weight="bold" muted>
                  {durationLabel(draft.audio.durationS)}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Delete voice note" onPress={deleteAudio} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" color={t.colors.textMuted} size={18} />
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={{ backgroundColor: t.colors.surface, borderRadius: 24, padding: 14, paddingHorizontal: 16, gap: 10 }}>
            <Text size={15} weight="extrabold" nativeID="comment-label">
              Comment
            </Text>
            <TextInput
              accessibilityLabelledBy="comment-label"
              value={draft.comment}
              onChangeText={(comment) => setDraft((d) => ({ ...d, comment }))}
              placeholder="e.g. Hinge on the door is loose"
              placeholderTextColor={t.colors.textMuted}
              multiline
              style={[input, { minHeight: 84, textAlignVertical: 'top' }]}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {commentPhotos.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel="Remove this photo from the comment"
                  onPress={() =>
                    setDraft((d) => {
                      discardFile(p.localUri);
                      discardFile(p.thumbnailLocalUri);
                      return { ...d, photos: d.photos.filter((x) => x.id !== p.id) };
                    })
                  }
                >
                  <Image source={{ uri: p.thumbnailLocalUri }} style={{ width: 48, height: 48, borderRadius: 14 }} />
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={addCommentPhoto}
                style={{ height: 48, paddingHorizontal: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: t.colors.dashed, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Icon name="plus" color={t.colors.primary} size={18} />
                <Text size={14} weight="extrabold" color={t.colors.primary}>
                  Add photo to comment
                </Text>
              </Pressable>
            </View>
          </View>
          {error ? (
            <Text size={14} weight="bold" color={t.colors.danger}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8, flexDirection: 'row', gap: 10 }}>
        <Button label="Skip this step" variant="secondary" style={{ flex: 1 }} disabled={rec.isRecording} onPress={onNext} />
        <Button label="Next: Review" style={{ flex: 1.4 }} disabled={rec.isRecording} onPress={onNext} />
      </View>
    </SafeAreaView>
  );
}
