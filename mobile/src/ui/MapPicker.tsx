/** Place or adjust a library's pin on a map (the fallback for every location problem). */
import { useState } from 'react';
import { Modal, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Button, Text } from './kit';

export function MapPicker({
  visible,
  initial,
  onCancel,
  onPick,
}: {
  visible: boolean;
  initial: { latitude: number; longitude: number } | null;
  onCancel: () => void;
  onPick: (p: { latitude: number; longitude: number }) => void;
}) {
  const t = useTheme();
  const start = initial ?? { latitude: 39.8283, longitude: -98.5795 };
  const [pin, setPin] = useState(start);
  const region: Region = { ...start, latitudeDelta: initial ? 0.004 : 30, longitudeDelta: initial ? 0.004 : 30 };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} onShow={() => setPin(start)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
        <View style={{ padding: 16, gap: 4 }}>
          <Text size={22} weight="extrabold">
            Place the library on the map
          </Text>
          <Text size={14} muted>
            Drag the pin, or tap the map where the library stands.
          </Text>
        </View>
        <MapView
          style={{ flex: 1 }}
          initialRegion={region}
          showsUserLocation
          onPress={(e) => setPin(e.nativeEvent.coordinate)}
        >
          <Marker coordinate={pin} draggable onDragEnd={(e) => setPin(e.nativeEvent.coordinate)} pinColor={t.colors.primary} />
        </MapView>
        <View style={{ padding: 16, flexDirection: 'row', gap: 10 }}>
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onCancel} />
          <Button label="Use this spot" style={{ flex: 1.4 }} onPress={() => onPick(pin)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
