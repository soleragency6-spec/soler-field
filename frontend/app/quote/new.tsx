import { useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, ScreenHeader, AppIcon, useAccent } from "@/src/components/ui";
import { clientName } from "@/src/lib/format";

export default function NewQuote() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const qc = useQueryClient();

  const clients = useQuery({ queryKey: ["clients", ""], queryFn: () => api.get("/clients") });
  const create = useMutation({
    mutationFn: (clientId?: string) => api.post("/quotes", { client_id: clientId, items: [{ description: "Prestation", quantity: 1, unit: "u", unit_price_ht: null, vat_rate: 20 }] }),
    onSuccess: (q) => { qc.invalidateQueries({ queryKey: ["documents"] }); router.replace(`/quote/${q.id}`); },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Nouveau devis" subtitle="Choisissez un client (facultatif)" back />
      <View style={{ padding: 16 }}>
        <Button label="Devis sans client" variant="secondary" onPress={() => create.mutate(undefined)} loading={create.isPending} testID="quote-noclient" />
      </View>
      <FlatList
        data={clients.data || []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => create.mutate(item.id)} testID={`quote-client-${item.id}`}>
            <AppIcon name="account-circle" size={30} color={accent} />
            <Text style={{ flex: 1, fontSize: 16, color: colors.onSurface }}>{clientName(item)}</Text>
            <AppIcon name="chevron-right" size={22} color={colors.borderStrong} />
          </Pressable>
        )}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider },
}));
