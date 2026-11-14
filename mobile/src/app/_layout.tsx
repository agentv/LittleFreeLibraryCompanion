import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { router, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServicesProvider, useSession } from '../services/context';
import { lightTheme, ThemeContext } from '../theme';
import { Loading } from '../ui/kit';

/** Back to sign-in whenever the session ends (sign-out, or the server asks to sign in again). */
function SessionGuard() {
  const session = useSession();
  const segments = useSegments();
  const onSignIn = segments[0] === 'sign-in';
  useEffect(() => {
    if (session === null && !onSignIn) router.replace('/sign-in');
  }, [session, onSignIn]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const theme = lightTheme;
  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {fontsLoaded ? (
          <ServicesProvider fallback={<Loading />}>
            <SessionGuard />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
              <Stack.Screen name="checkin/[libraryId]" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
            </Stack>
          </ServicesProvider>
        ) : (
          <Loading />
        )}
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}
