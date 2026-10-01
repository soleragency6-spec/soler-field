import { useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Card, Empty, Loading, ScreenHeader, StatusBadge, AppIcon, useAccent } from "@/src/components/ui";
import { formatDate, joinName } from "@/src/lib/format";

const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "in_progress", label: "En cours" },
  { key: "report_review", label: "À vérifier" },
  { key: "report_validated", label: "Validés" },
  { key: "invoiced", label: "Facturées" },
  { key: "completed", label: "Terminées" },
];

export default function Interventions() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["interventions", filter],
    queryFn: () => api.get(`/interventions${filter ? `?status=${filter}` : ""}`),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader
        title="Interventions"
        right={
          <Pressable testID="interventions-add" onPress={() => router.push("/intervention/new")} style={[s.addBtn, { backgroundColor: accent }]}>
            <AppIcon name="plus" size={24} color="#FFFFFF" />
          </Pressable>
        }
      />
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable key={f.key || "all"} onPress={() => setFilter(f.key)} style={[s.chip, { borderColor: active ? accent : colors.border, backgroundColor: active ? accent : colors.surface }]} testID={`filter-${f.key || "all"}`}>
                <Text style={{ color: active ? "#FFFFFF" : colors.onSurfaceTertiary, fontWeight: "600", fontSize: 13 }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          ListEmptyComponent={<Empty icon="wrench" title="Aucune intervention" subtitle="Appuyez sur + pour démarrer une intervention." />}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/intervention/${item.id}`)} testID={`intervention-${item.id}`}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.sub}>{joinName(item.client_company, item.client_first, item.client_last)}</Text>
                  <Text style={s.date}>{formatDate(item.created_at)}{item.reference ? ` · ${item.reference}` : ""}</Text>
                </View>
                <StatusBadge status={item.status} />
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
  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 14, color: c.onSurfaceSecondary, marginTop: 2 },
  date: { fontSize: 12, color: c.muted, marginTop: 4 },
}));
