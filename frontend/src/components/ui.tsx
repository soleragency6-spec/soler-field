import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
  Platform,
} from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, useTheme } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { STATUS_TONE, statusLabel } from "@/src/lib/format";

export function useAccent() {
  const { primaryColor } = useApp();
  return primaryColor || "#1D4ED8";
}

export function AppIcon(props: { name: any; size?: number; color?: string; style?: any }) {
  return <Icon name={props.name} size={props.size ?? 22} color={props.color ?? "#111827"} style={props.style} />;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: any;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const accent = useAccent();
  const bg =
    variant === "primary" ? accent : variant === "danger" ? colors.error : variant === "secondary" ? colors.brandSecondary : "transparent";
  const fg = variant === "secondary" ? colors.onBrandSecondary : variant === "ghost" ? accent : "#FFFFFF";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 14,
          paddingVertical: 15,
          paddingHorizontal: 18,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: variant === "ghost" ? 1.5 : 0,
          borderColor: accent,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontWeight: "700" }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress, testID }: any) {
  const s = useCardStyles();
  if (onPress)
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.9 }]}>
        {children}
      </Pressable>
    );
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}
const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
}));

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  testID,
}: any) {
  const { colors } = useTheme();
  const s = useFieldStyles();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        style={[s.input, multiline && { height: 100, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}
const useFieldStyles = makeStyles((c) => ({
  label: { color: c.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: c.onSurface,
    borderWidth: 1,
    borderColor: c.border,
  },
}));

export function StatusBadge({ status }: { status?: string }) {
  const { colors } = useTheme();
  const tone = STATUS_TONE[status || ""] || "muted";
  const map: any = {
    success: [colors.success, "#FFFFFF"],
    warning: [colors.warning, "#FFFFFF"],
    info: [colors.info, "#FFFFFF"],
    error: [colors.error, "#FFFFFF"],
    muted: [colors.surfaceTertiary, colors.onSurfaceTertiary],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{statusLabel(status)}</Text>
    </View>
  );
}

export function ScreenHeader({ title, subtitle, right, back }: { title: string; subtitle?: string; right?: React.ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {back ? (
          <Pressable testID="header-back" onPress={() => router.back()} hitSlop={10} style={{ marginLeft: -4 }}>
            <Icon name="chevron-left" size={30} color={colors.onSurface} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function Empty({ icon = "inbox-outline", title, subtitle }: { icon?: any; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
      <Icon name={icon} size={54} color={colors.borderStrong} />
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>{subtitle}</Text> : null}
    </View>
  );
}

export function Loading() {
  const accent = useAccent();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <ActivityIndicator size="large" color={accent} />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>;
}

export function T({ children, style, size = 15, weight = "500", color }: { children: React.ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle["fontWeight"]; color?: string }) {
  const { colors } = useTheme();
  return <Text style={[{ fontSize: size, fontWeight: weight, color: color || colors.onSurface }, style]}>{children}</Text>;
}
