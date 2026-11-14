/** Shows an attachment's photo: the file on the phone if there is one, else a short-lived link from the server. */
import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { useServices } from '../services/context';
import { useTheme } from '../theme';
import type { Attachment } from '../types/models';
import { Text } from './kit';

export function Photo({
  attachment,
  style,
  thumbnail = true,
  placeholder,
}: {
  attachment: Attachment | null | undefined;
  style: StyleProp<ImageStyle>;
  thumbnail?: boolean;
  placeholder?: string;
}) {
  const t = useTheme();
  const { sync } = useServices();
  const local = attachment ? (thumbnail ? attachment.thumbnailLocalUri ?? attachment.localUri : attachment.localUri ?? attachment.thumbnailLocalUri) : null;
  const remotePath = attachment ? (thumbnail ? attachment.thumbnailStoragePath ?? attachment.storagePath : attachment.storagePath) : null;
  const [failedLocal, setFailedLocal] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ path: string; url: string } | null>(null);
  const useLocal = !!local && failedLocal !== local;
  const uri = useLocal ? local : remote && remote.path === remotePath ? remote.url : null;

  useEffect(() => {
    if (useLocal || !remotePath) return;
    let live = true;
    sync.media
      .getUrls([remotePath])
      .then((urls) => {
        const url = urls[remotePath];
        if (live && url) setRemote({ path: remotePath, url });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [useLocal, remotePath, sync.media]);

  if (!uri) {
    return (
      <View style={[{ backgroundColor: t.colors.placeholder, alignItems: 'center', justifyContent: 'center' }, style as never]}>
        {placeholder ? (
          <Text size={13} muted>
            {placeholder}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: t.colors.placeholder }, style]}
      accessibilityIgnoresInvertColors
      onError={() => {
        if (useLocal) setFailedLocal(local);
      }}
    />
  );
}
