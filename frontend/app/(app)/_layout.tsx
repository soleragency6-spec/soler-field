import { Tabs } from "expo-router";
import { Platform } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";

import { useTheme } from "@/src/theme";
import { useAccent } from "@/src/components/ui";

export default function AppTabs() {
  const { colors } = useTheme();
  const accent = useAccent();
  const desktop = Platform.OS === "web";
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: "#0B0B0B",
          borderTopColor: colors.divider,
          borderRightColor: colors.divider,
          ...(desktop ? { width: 248, paddingHorizontal: 14, paddingTop: 28, paddingBottom: 18 } : { height: 64 }),
        },
        tabBarItemStyle: desktop ? { minHeight: 52, borderRadius: 12, marginVertical: 3, paddingHorizontal: 12, alignItems: "flex-start" } : { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: desktop ? 13 : 11, fontWeight: "700", marginLeft: desktop ? 8 : 0 },
        tabBarIconStyle: { marginLeft: desktop ? 0 : 0 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: ({ color, size }) => <Icon name="home-variant" size={size} color={color} /> }} />
      <Tabs.Screen name="interventions" options={{ title: "Interventions", tabBarIcon: ({ color, size }) => <Icon name="wrench" size={size} color={color} /> }} />
      <Tabs.Screen name="clients" options={{ title: "Clients", tabBarIcon: ({ color, size }) => <Icon name="account-group" size={size} color={color} /> }} />
      <Tabs.Screen name="documents" options={{ title: "Documents", tabBarIcon: ({ color, size }) => <Icon name="file-document-multiple" size={size} color={color} /> }} />
      <Tabs.Screen name="reglages" options={{ title: "Réglages", tabBarIcon: ({ color, size }) => <Icon name="cog" size={size} color={color} /> }} />
    </Tabs>
  );
}
