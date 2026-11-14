/** Your devices: see them all and remove a lost phone (backend R31). */
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { useDeviceState, useServices } from '../services/context';
import { useTheme } from '../theme';
import type { Device } from '../types/models';
import { Badge, Button, Card, Header, Screen, Text } from '../ui/kit';

const DEVICE_STATUS_LABEL: Record<Device['status'], string> = { pending: 'Waiting for approval', trusted: 'Trusted', revoked: 'Removed' };

export default function Devices() {
  const t = useTheme();
  const { devices } = useServices();
  const here = useDeviceState();
  const [list, setList] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(
    () =>
      devices.listMine().then(
        (l) => {
          setList(l);
          setError(null);
          setLoading(false);
        },
        (e: unknown) => {
          setError(e instanceof Error ? e.message : "Couldn't load your devices.");
          setLoading(false);
        },
      ),
    [devices],
  );
  const load = useCallback(() => {
    setLoading(true);
    return fetchList();
  }, [fetchList]);
  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const revoke = (d: Device) =>
    Alert.alert(
      d.id === here?.deviceId ? 'Remove this phone?' : 'Remove this device?',
      d.id === here?.deviceId ? 'It stops syncing right away. Anything not uploaded yet will be held for an admin.' : 'It stops syncing at its next request.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await devices.revoke(d.id);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't remove it.");
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <Header title="Devices" />
      {error ? (
        <Text color={t.colors.danger} weight="bold" style={{ paddingHorizontal: 20 }}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={list ?? []}
        keyExtractor={(d) => d.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 20, gap: 10 }}
        ListEmptyComponent={list ? <Text muted>No devices.</Text> : undefined}
        renderItem={({ item }) => (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text size={15} weight="extrabold" style={{ flex: 1 }}>
                {`${item.model ?? (item.platform === 'ios' ? 'iPhone' : 'Android phone')}${item.id === here?.deviceId ? ' (this phone)' : ''}`}
              </Text>
              <Badge tone="outline" label={DEVICE_STATUS_LABEL[item.status]} dot={item.status === 'trusted' ? t.colors.success : t.colors.primary} />
            </View>
            <Text size={13} muted>
              {`Registered ${new Date(item.registeredAt).toLocaleDateString()}${item.lastSeenAt ? ` · last seen ${new Date(item.lastSeenAt).toLocaleDateString()}` : ''}`}
            </Text>
            {item.status !== 'revoked' ? <Button label="Remove" variant="link" style={{ alignSelf: 'flex-start' }} onPress={() => revoke(item)} /> : null}
          </Card>
        )}
      />
    </Screen>
  );
}
