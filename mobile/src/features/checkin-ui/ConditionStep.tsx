/** Step 2 of 4 (design: W2-Condition.dc.html). Optional; tap an answer again to clear it. */
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import type { ConditionLevel, StockLevel } from '../../types/models';
import { Button, Chip, StepHeader, Text } from '../../ui/kit';
import type { CheckInDraft } from '../checkin';
import { CONDITION_LABEL, STOCK_LABEL } from '../describe';

type Group<T> = { label: string; options: { value: T; label: string }[]; get: (d: CheckInDraft) => T | null; set: (d: CheckInDraft, v: T | null) => CheckInDraft };

const YES_NO = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
];

const GROUPS: Group<StockLevel | ConditionLevel | boolean>[] = [
  {
    label: 'Books',
    options: (Object.keys(STOCK_LABEL) as StockLevel[]).map((v) => ({ value: v, label: STOCK_LABEL[v] })),
    get: (d) => d.stockLevel,
    set: (d, v) => ({ ...d, stockLevel: v as StockLevel | null }),
  },
  {
    label: 'Condition',
    options: (Object.keys(CONDITION_LABEL) as ConditionLevel[]).map((v) => ({ value: v, label: CONDITION_LABEL[v] })),
    get: (d) => d.condition,
    set: (d, v) => ({ ...d, condition: v as ConditionLevel | null }),
  },
  { label: 'Door and latch working?', options: YES_NO, get: (d) => d.doorOk, set: (d, v) => ({ ...d, doorOk: v as boolean | null }) },
  {
    label: 'Removed anything (trash, unsuitable items)?',
    options: YES_NO,
    get: (d) => d.itemsRemoved,
    set: (d, v) => ({ ...d, itemsRemoved: v as boolean | null }),
  },
];

export function ConditionStep({
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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }} edges={['top', 'bottom']}>
      <StepHeader step={2} title="Condition (optional)" onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 12, paddingBottom: 16 }}>
        <View>
          <Text size={24} weight="extrabold">
            {"How's the library today?"}
          </Text>
          <Text size={14} muted style={{ marginTop: 2 }}>
            Optional. Tap one answer for each, or skip this step.
          </Text>
        </View>
        {GROUPS.map((g) => (
          <View key={g.label} accessibilityRole="radiogroup" accessibilityLabel={g.label} style={{ backgroundColor: t.colors.surface, borderRadius: 24, padding: 14, paddingHorizontal: 16, gap: 10 }}>
            <Text size={15} weight="extrabold">
              {g.label}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {g.options.map((o) => {
                const selected = g.get(draft) === o.value;
                return <Chip key={String(o.value)} label={o.label} selected={selected} onPress={() => setDraft((d) => g.set(d, selected ? null : o.value))} />;
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8, flexDirection: 'row', gap: 10 }}>
        <Button
          label="Skip this step"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={onNext}
        />
        <Button label="Next: Notes" style={{ flex: 1.4 }} onPress={onNext} />
      </View>
    </SafeAreaView>
  );
}
