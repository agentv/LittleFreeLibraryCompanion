/** Small building blocks in the Neighborly look. All colors come from the theme. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon, type IconName } from './Icon';

type Weight = 'regular' | 'semibold' | 'bold' | 'extrabold';

export function Text({
  size = 15,
  weight = 'regular',
  color,
  muted,
  style,
  ...rest
}: TextProps & { size?: number; weight?: Weight; color?: string; muted?: boolean }) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      style={[{ fontFamily: t.fonts[weight], fontSize: size, color: color ?? (muted ? t.colors.textMuted : t.colors.text) }, style]}
    />
  );
}

export function Screen({
  children,
  scroll,
  dark,
  footer,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  dark?: boolean;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = dark ? t.colors.camera.background : t.colors.background;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[{ paddingBottom: 24 }, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, style]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function RoundButton({
  icon,
  label,
  onPress,
  dark,
  size = 44,
  filled,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  dark?: boolean;
  size?: number;
  filled?: boolean;
}) {
  const t = useTheme();
  const bg = filled ? t.colors.primary : dark ? t.colors.camera.surface : t.colors.surface;
  const fg = filled ? t.colors.onPrimary : dark ? t.colors.camera.text : t.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 },
        !dark && !filled ? t.shadow : null,
      ]}
    >
      <Icon name={icon} color={fg} size={Math.round(size / 2)} />
    </Pressable>
  );
}

export function Header({ title, onBack, right, dark }: { title?: string; onBack?: () => void; right?: ReactNode; dark?: boolean }) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <RoundButton icon="back" label="Back" dark={dark} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
      <Text size={15} weight="extrabold" style={{ flex: 1, textAlign: 'center' }} color={dark ? t.colors.camera.text : undefined}>
        {title ?? ''}
      </Text>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  busy,
  style,
  dark,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'link';
  size?: 'md' | 'lg' | 'xl';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  const t = useTheme();
  const height = size === 'xl' ? 64 : size === 'lg' ? 60 : 52;
  const fontSize = size === 'xl' ? 19 : size === 'lg' ? 18 : 15;
  const palette = {
    primary: { bg: dark ? t.colors.camera.text : t.colors.primary, fg: dark ? t.colors.camera.background : t.colors.onPrimary, border: 'transparent' },
    secondary: { bg: dark ? t.colors.camera.surface : t.colors.surface, fg: dark ? t.colors.camera.text : t.colors.text, border: 'transparent' },
    outline: { bg: 'transparent', fg: t.colors.primary, border: t.colors.border },
    link: { bg: 'transparent', fg: dark ? t.colors.camera.accent : t.colors.primary, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: variant === 'link' ? undefined : height,
          paddingVertical: variant === 'link' ? 10 : 0,
          paddingHorizontal: variant === 'link' ? 6 : 16,
          borderRadius: height / 2,
          backgroundColor: palette.bg,
          borderWidth: variant === 'outline' ? 2 : 0,
          borderColor: palette.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        variant === 'secondary' && !dark ? t.shadow : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} color={palette.fg} size={24} /> : null}
      <Text size={fontSize} weight={variant === 'secondary' ? 'bold' : 'extrabold'} color={palette.fg}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.colors.surface, borderRadius: t.radius.lg, padding: 16 };
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress, dark, small }: { label: string; selected: boolean; onPress: () => void; dark?: boolean; small?: boolean }) {
  const t = useTheme();
  const h = small ? 40 : 44;
  const bg = dark ? (selected ? t.colors.camera.text : t.colors.camera.surface) : selected ? t.colors.primary : t.colors.surface;
  const fg = dark ? (selected ? t.colors.camera.background : t.colors.camera.text) : selected ? t.colors.onPrimary : t.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: h,
        paddingHorizontal: small ? 14 : 16,
        borderRadius: h / 2,
        backgroundColor: bg,
        borderWidth: !dark && !selected ? 2 : 0,
        borderColor: t.colors.border,
        justifyContent: 'center',
      }}
    >
      <Text size={small ? 14 : 15} weight={selected ? 'extrabold' : 'bold'} color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Banner({ children, icon = 'upload', style }: { children: ReactNode; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={[{ padding: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: t.colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}
    >
      <Icon name={icon} color={t.colors.onAccentSoft} size={18} />
      <Text size={14} weight="semibold" color={t.colors.onAccentSoft} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

export function Badge({ label, tone = 'soft', dot }: { label: string; tone?: 'soft' | 'outline'; dot?: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        backgroundColor: tone === 'soft' ? t.colors.accentSoft : t.colors.surface,
        borderWidth: tone === 'outline' ? 2 : 0,
        borderColor: t.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text size={13} weight="extrabold" color={tone === 'soft' ? t.colors.onAccentSoft : t.colors.text}>
        {label}
      </Text>
    </View>
  );
}

export function StepHeader({ step, title, onBack, dark, backIcon = 'back', right }: { step: number; title: string; onBack: () => void; dark?: boolean; backIcon?: IconName; right?: ReactNode }) {
  const t = useTheme();
  const on = dark ? t.colors.camera.accent : t.colors.primary;
  const off = dark ? t.colors.camera.track : t.colors.placeholder;
  return (
    <View style={styles.header}>
      <RoundButton icon={backIcon} label={backIcon === 'close' ? 'Cancel check-in' : 'Back'} dark={dark} onPress={onBack} />
      <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
        <Text size={13} weight="bold" color={dark ? t.colors.camera.textMuted : t.colors.textMuted}>
          {`Step ${step} of 4 · ${title}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4, width: 160 }} accessibilityElementsHidden>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? on : off }} />
          ))}
        </View>
      </View>
      <View style={{ width: 44 }}>{right}</View>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
      <ActivityIndicator color={t.colors.primary} size="large" />
    </View>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text size={15} weight="extrabold">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text size={13} muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function useInputStyle(): TextStyle {
  const t = useTheme();
  return {
    borderWidth: 2,
    borderColor: t.colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: t.fonts.regular,
    color: t.colors.text,
    backgroundColor: t.colors.surface,
  };
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
