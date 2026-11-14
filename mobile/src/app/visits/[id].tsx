/** One visit: photos by role, condition, voice note and comments, and where it stands with the server. */
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { conditionSentence, durationLabel, hasCondition, ROLE_LABEL, shortWhen } from '../../features/describe';
import { attachmentsFor } from '../../features/queries';
import { describeSyncNote, needsFileUpload } from '../../sync';
import { useServices, useStore } from '../../services/context';
import { useMe } from '../../services/useMe';
import { useTheme } from '../../theme';
import { canEdit, type Attachment } from '../../types/models';
import { Icon } from '../../ui/Icon';
import { Banner, Button, Card, Header, Screen, Text } from '../../ui/kit';
import { Photo } from '../../ui/Photo';

function VoiceNote({ attachment }: { attachment: Attachment }) {
  const t = useTheme();
  const { sync } = useServices();
  const [uri, setUri] = useState<string | null>(attachment.localUri);
  useEffect(() => {
    if (uri || !attachment.storagePath) return;
    const path = attachment.storagePath;
    sync.media.getUrls([path]).then((u) => u[path] && setUri(u[path]!), () => undefined);
  }, [uri, attachment.storagePath, sync.media]);
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <View style={{ height: 52, borderRadius: 26, backgroundColor: t.colors.background, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
        disabled={!uri}
        onPress={() => {
          if (status.playing) return player.pause();
          if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
          player.play();
        }}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.text, alignItems: 'center', justifyContent: 'center', opacity: uri ? 1 : 0.4 }}
      >
        <Icon name={status.playing ? 'pause' : 'play'} color={t.colors.surface} size={16} />
      </Pressable>
      <Text size={14} weight="bold" style={{ flex: 1 }}>
        Voice note
      </Text>
      <Text size={13} weight="bold" muted style={{ marginRight: 10 }}>
        {durationLabel(attachment.durationS ?? 0)}
      </Text>
    </View>
  );
}

export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sync } = useServices();
  const { me } = useMe();
  const data = useStore((store) => {
    const visit = store.get('visits', id);
    if (!visit) return null;
    const atts = attachmentsFor(store, id);
    return {
      visit,
      library: store.get('libraries', visit.libraryId),
      atts,
      comments: store.list('comments', { visitId: id }),
      sync: store.syncInfo('visits', id),
      filesWaiting: atts.filter(needsFileUpload).length,
    };
  });

  if (!data) {
    return (
      <Screen>
        <Header title="Check-in" />
        <Text muted style={{ padding: 20 }}>
          {"This check-in isn't on this phone."}
        </Text>
      </Screen>
    );
  }
  const { visit, library, atts, comments } = data;
  const photos = atts.filter((a) => a.kind === 'photo' && !a.commentId);
  const audio = atts.find((a) => a.kind === 'audio');
  const mine = me ? canEdit(me, visit.userId) : false;

  const remove = () =>
    Alert.alert('Delete this check-in?', 'Its photos and notes are removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const a of atts) await sync.store.remove('attachments', a.id);
          for (const c of comments) await sync.store.remove('comments', c.id);
          await sync.store.remove('visits', visit.id);
          void sync.syncNow().catch(() => undefined);
          router.back();
        },
      },
    ]);

  const state = data.sync?.state;
  return (
    <Screen scroll style={{ paddingHorizontal: 20, gap: 12 }}>
      <Header title="Check-in" />
      <View>
        <Text size={24} weight="extrabold">
          {library?.name ?? 'Library'}
        </Text>
        <Text size={14} muted>
          {shortWhen(visit.visitedAt)}
        </Text>
      </View>

      {state === 'held' ? <Banner icon="shield">{describeSyncNote(data.sync?.note ?? 'device_')}</Banner> : null}
      {state === 'rejected' ? <Banner icon="shield">{`Not accepted: ${describeSyncNote(data.sync?.note ?? null)}`}</Banner> : null}
      {state === 'local' || data.filesWaiting ? <Banner>Saved on this phone. It will upload on its own.</Banner> : null}

      <Card style={{ gap: 10 }}>
        <Text size={15} weight="extrabold">
          Photos
        </Text>
        {photos.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {photos.map((p) => (
              <View key={p.id} style={{ alignItems: 'center', gap: 4 }}>
                <Photo attachment={p} style={{ width: 96, height: 96, borderRadius: 18 }} />
                <Text size={12} weight="bold" muted>
                  {p.role ? ROLE_LABEL[p.role] : 'Extra'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text muted>No photos.</Text>
        )}
      </Card>

      <Card style={{ gap: 6 }}>
        <Text size={15} weight="extrabold">
          Condition
        </Text>
        <Text size={15} muted={!hasCondition(visit)} style={{ lineHeight: 21 }}>
          {hasCondition(visit) ? conditionSentence(visit) : 'Not recorded.'}
        </Text>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text size={15} weight="extrabold">
          Notes
        </Text>
        {audio ? <VoiceNote attachment={audio} /> : null}
        {comments.map((c) => (
          <View key={c.id} style={{ gap: 8 }}>
            <Text size={15}>{c.body}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {atts
                .filter((a) => a.commentId === c.id)
                .map((a) => (
                  <Photo key={a.id} attachment={a} style={{ width: 64, height: 64, borderRadius: 14 }} />
                ))}
            </View>
          </View>
        ))}
        {!audio && !comments.length ? <Text muted>No notes.</Text> : null}
      </Card>

      {mine ? <Button label="Delete this check-in" variant="outline" onPress={remove} /> : null}
    </Screen>
  );
}
