import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#0B0B0B",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#151515",
  onSurfaceSecondary: "#F5F5F5",
  surfaceTertiary: "#202020",
  onSurfaceTertiary: "#C7C7C7",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0B0B0B",
  muted: "#9A9A9A",
  brand: "#E21B2D",
  onBrand: "#FFFFFF",
  brandPrimary: "#E21B2D",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#3B1117",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#261014",
  onBrandTertiary: "#FFFFFF",
  success: "#B51224",
  onSuccess: "#FFFFFF",
  warning: "#7A0F1B",
  onWarning: "#FFFFFF",
  error: "#B91C1C",
  onError: "#FFFFFF",
  info: "#E21B2D",
  onInfo: "#FFFFFF",
  border: "#303030",
  borderStrong: "#4A4A4A",
  divider: "#303030",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system && (themes as any)[system] ? system : defaultScheme) as ColorScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
