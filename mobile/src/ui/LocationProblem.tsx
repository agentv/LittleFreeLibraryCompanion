/** Plain message and next steps for a location problem (src/location LOCATION_PROBLEM_HANDLING). */
import { View } from 'react-native';
import { LOCATION_PROBLEM_HANDLING, type LocationProblem } from '../location';
import { useServices } from '../services/context';
import { useTheme } from '../theme';
import { Button, Card, Text } from './kit';

const ACTION_LABEL = { retry: 'Try again', open_settings: 'Open Settings', place_on_map: 'Place on map', continue: 'Use it anyway' } as const;

export function LocationProblemCard({
  problem,
  onRetry,
  onPlaceOnMap,
  onContinue,
  hide = [],
}: {
  problem: LocationProblem;
  onRetry?: () => void;
  onPlaceOnMap?: () => void;
  onContinue?: () => void;
  hide?: (keyof typeof ACTION_LABEL)[];
}) {
  const t = useTheme();
  const { location } = useServices();
  const h = LOCATION_PROBLEM_HANDLING[problem];
  const handlers = { retry: onRetry, open_settings: () => void location.openSettings(), place_on_map: onPlaceOnMap, continue: onContinue };
  const actions = h.actions.filter((a) => !hide.includes(a) && handlers[a]);
  return (
    <Card style={{ backgroundColor: t.colors.accentSoft, gap: 10 }}>
      <Text size={14} weight="semibold" color={t.colors.onAccentSoft}>
        {h.message}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {actions.map((a) => (
          <Button key={a} label={ACTION_LABEL[a]} variant="link" onPress={handlers[a]} />
        ))}
      </View>
    </Card>
  );
}
