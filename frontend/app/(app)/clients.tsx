import { useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Card, Empty, Field, Loading, ScreenHeader, AppIcon, useAccent } from "@/src/components/ui";
import { clientName } from "@/src/lib/format";

export default function Clients() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["clients", q],
    queryFn: () => api.get(`/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader
        title="Clients"
        right={
          <Pressable testID="clients-add" onPress={() => router.push("/client/new")} style={[s.addBtn, { backgroundColor: accent }]}>
            <AppIcon name="plus" size={24} color="#FFFFFF" />
          </Pressable>
        }
      />
      <View style={{ padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <Field placeholder="Rechercher un client…" value={q} onChangeText={setQ} testID="clients-search" />
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          ListEmptyComponent={<Empty icon="account-group" title="Aucun client" subtitle="Ajoutez votre premier client avec le bouton +." />}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/client/${item.id}`)} testID={`client-${item.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[s.avatar, { backgroundColor: colors.brandTertiary }]}>
                  <Text style={{ color: accent, fontWeight: "800", fontSize: 16 }}>{clientName(item).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={1}>{clientName(item)}</Text>
                  <Text style={s.sub}>{item.phone || item.email || "—"}</Text>
                </View>
                <AppIcon name="chevron-right" size={22} color={colors.borderStrong} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
}));
