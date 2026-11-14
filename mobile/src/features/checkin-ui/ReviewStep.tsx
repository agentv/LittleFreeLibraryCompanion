/** Step 4 of 4 (design: W4-Review.dc.html): summaries with Edit links; saves on the phone and uploads later. */
import type { ReactNode } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnline } from '../../services/context';
import { useTheme } from '../../theme';
import { Banner, Button, StepHeader, Text } from '../../ui/kit';
import type { CheckInDraft } from '../checkin';
import { conditionSentence, durationLabel, hasCondition, PHOTO_ROLES, ROLE_LABEL } from '../describe';

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={title} style={{ backgroundColor: t.colors.surface, borderRadius: 24, padding: 14, paddingHorizontal: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text size={15} weight="extrabold">
          {title}
        </Text>
        <Button label="Edit" variant="link" onPress={onEdit} />
      </View>
      {children}
    </View>
  );
}

export function ReviewStep({
  draft,
  libraryName,
  onBack,
  onEdit,
  onFinish,
  saving,
  pausedReason,
}: {
  draft: CheckInDraft;
  libraryName: string;
  onBack: () => void;
  onEdit: (step: 1 | 2 | 3) => void;
  onFinish: () => void;
  saving: boolean;
  pausedReason: string | null;
}) {
  const t = useTheme();
  const online = useOnline();
  const visitPhotos = draft.photos.filter((p) => !p.forComment);
  const extras = visitPhotos.filter((p) => !p.role).length;
  const commentPhotos = draft.photos.filter((p) => p.forComment).length;
  const comment = draft.comment.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top', 'bottom']}>
      <StepHeader step={4} title="Review" onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 12, paddingBottom: 16 }}>
        <View>
          <Text size={24} weight="extrabold">
            Looks good?
          </Text>
          <Text size={14} muted style={{ marginTop: 2 }}>
            {`${libraryName} · today`}
          </Text>
        </View>

        <Section title="Photos" onEdit={() => onEdit(1)}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            {PHOTO_ROLES.map((r) => {
              const p = visitPhotos.find((x) => x.role === r);
              return (
                <View key={r} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
                  {p ? (
                    <Image source={{ uri: p.thumbnailLocalUri }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: t.colors.primary }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', borderColor: t.colors.dashed }} />
                  )}
                  <Text size={12} weight="bold" muted={!p} style={{ textAlign: 'center' }}>
                    {p ? ROLE_LABEL[r] : `${ROLE_LABEL[r]}: skipped`}
                  </Text>
                </View>
              );
            })}
          </View>
          {extras ? (
            <Text size={13} muted>
              {`Plus ${extras} extra photo${extras === 1 ? '' : 's'}`}
            </Text>
          ) : null}
        </Section>

        <Section title="Condition" onEdit={() => onEdit(2)}>
          <Text size={15} style={{ lineHeight: 21 }} muted={!hasCondition(draft)}>
            {hasCondition(draft) ? conditionSentence(draft) : 'Skipped'}
          </Text>
        </Section>

        <Section title="Notes" onEdit={() => onEdit(3)}>
          {!draft.audio && !comment && !commentPhotos ? (
            <Text size={15} muted>
              Skipped
            </Text>
          ) : null}
          {draft.audio ? <Text size={15}>{`Voice note · ${durationLabel(draft.audio.durationS)}`}</Text> : null}
          {comment || commentPhotos ? (
            <Text size={15} numberOfLines={2}>
              {[comment ? `"${comment.length > 40 ? `${comment.slice(0, 40)}…` : comment}"` : null, commentPhotos ? `${commentPhotos} photo${commentPhotos === 1 ? '' : 's'}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </Section>

        {!draft.position ? (
          <Text size={13} muted>
            {"We couldn't get your position. That's fine: the check-in is saved without it."}
          </Text>
        ) : null}

        {pausedReason ? (
          <Banner icon="shield">{pausedReason}</Banner>
        ) : !online ? (
          <Banner>{"No signal right now. It's saved and will upload on its own."}</Banner>
        ) : (
          <Banner>{"It's saved on this phone first, then uploads in the background."}</Banner>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8 }}>
        <Button label="Finish check-in" size="lg" busy={saving} onPress={onFinish} />
      </View>
    </SafeAreaView>
  );
}
