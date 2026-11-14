/** Sign in with an emailed code. Accounts are made on the web form, never here (backend R11a). */
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { ENV } from '../config/env';
import { useServices, useSession } from '../services/context';
import { useTheme } from '../theme';
import { Banner, Button, Field, Screen, Text, useInputStyle } from '../ui/kit';

export default function SignIn() {
  const t = useTheme();
  const { auth, demo } = useServices();
  const session = useSession();
  const input = useInputStyle();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect href="/" />;

  const send = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email address you signed up with.');
    setBusy(true);
    try {
      await auth.requestSignIn(email);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      await auth.completeSignIn(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 18 }}>
        <View style={{ gap: 4 }}>
          <Text size={15} weight="bold" muted>
            LFL Steward Companion
          </Text>
          <Text size={28} weight="extrabold">
            {step === 'email' ? 'Welcome, steward' : 'Check your email'}
          </Text>
          <Text size={15} muted>
            {step === 'email'
              ? "We'll email you a sign-in code."
              : `We sent a code to ${email.trim()}. It may take a minute to arrive.`}
          </Text>
        </View>

        {demo ? <Banner icon="shield">{`Demo mode: any email works, and the code is ${ENV.demoSignInCode}. Nothing leaves this phone.`}</Banner> : null}

        {step === 'email' ? (
          <Field label="Email">
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.org"
              placeholderTextColor={t.colors.textMuted}
              style={input}
              onSubmitEditing={send}
              returnKeyType="send"
            />
          </Field>
        ) : (
          <Field label="Sign-in code">
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="123456"
              placeholderTextColor={t.colors.textMuted}
              style={[input, { fontSize: 22, letterSpacing: 6 }]}
              onSubmitEditing={verify}
              maxLength={12}
            />
          </Field>
        )}

        {error ? (
          <Text size={14} weight="bold" color={t.colors.danger} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        {step === 'email' ? (
          <Button label="Email me a code" size="lg" busy={busy} onPress={send} />
        ) : (
          <View style={{ gap: 8 }}>
            <Button label="Sign in" size="lg" busy={busy} onPress={verify} disabled={code.trim().length < 4} />
            <Button label="Use a different email" variant="link" onPress={() => setStep('email')} />
          </View>
        )}

        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Text size={14} muted>
            {"Don't have an account?"}
          </Text>
          <Button label="Sign up on the web" variant="link" onPress={() => WebBrowser.openBrowserAsync(auth.signUpUrl)} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
