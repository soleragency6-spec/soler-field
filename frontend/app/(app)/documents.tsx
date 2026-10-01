import { useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Card, Empty, Loading, ScreenHeader, StatusBadge, AppIcon, useAccent } from "@/src/components/ui";
import { formatDate, formatMoney, joinName } from "@/src/lib/format";

const TABS = [
  { key: "reports", label: "Rapports", endpoint: "/reports", icon: "clipboard-text" },
  { key: "invoices", label: "Factures", endpoint: "/invoices", icon: "file-document" },
  { key: "quotes", label: "Devis", endpoint: "/quotes", icon: "file-sign" },
];

export default function Documents() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const [tab, setTab] = useState(TABS[0]);

  const { data, isLoading } = useQuery({ queryKey: ["documents", tab.key], queryFn: () => api.get(tab.endpoint) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Documents" />
      <View style={s.segment}>
        {TABS.map((t) => {
          const active = t.key === tab.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t)} style={[s.segBtn, active && { backgroundColor: accent }]} testID={`doctab-${t.key}`}>
              <Text style={{ color: active ? "#FFFFFF" : colors.onSurfaceTertiary, fontWeight: "700", fontSize: 14 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          ListEmptyComponent={<Empty icon={tab.icon} title={`Aucun ${tab.label.toLowerCase()}`} subtitle="Les documents générés apparaîtront ici." />}
          renderItem={({ item }) => {
            const to = tab.key === "reports" ? `/report/${item.id}` : tab.key === "invoices" ? `/invoice/${item.id}` : `/quote/${item.id}`;
            return (
              <Card onPress={() => router.push(to as any)} testID={`doc-${item.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>
                      {tab.key === "reports" ? item.title : item.number || "Brouillon"}
                    </Text>
                    <Text style={s.sub}>{joinName(item.client_company, item.client_first, item.client_last)}</Text>
                    <Text style={s.date}>
                      {formatDate(item.created_at || item.issue_date)}
                      {tab.key !== "reports" ? ` · ${formatMoney(item.total_ttc)}` : ""}
                    </Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  segment: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  segBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 14, color: c.onSurfaceSecondary, marginTop: 2 },
  date: { fontSize: 12, color: c.muted, marginTop: 4 },
}));
