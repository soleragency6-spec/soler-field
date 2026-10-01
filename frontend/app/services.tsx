import { useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Field, ScreenHeader, Empty, AppIcon, useAccent } from "@/src/components/ui";
import { formatMoney } from "@/src/lib/format";

export default function Services() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const qc = useQueryClient();
  const [f, setF] = useState<any>({ unit: "u", vat_rate: 20 });
  const [showForm, setShowForm] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const { data } = useQuery({ queryKey: ["services"], queryFn: () => api.get("/services") });
  const create = useMutation({
    mutationFn: () => api.post("/services", { ...f, unit_price_ht: f.unit_price_ht === "" || f.unit_price_ht == null ? null : parseFloat(f.unit_price_ht), vat_rate: parseFloat(f.vat_rate) || 20 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setF({ unit: "u", vat_rate: 20 }); setShowForm(false); },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Prestations & Tarifs" back
        right={<Pressable onPress={() => setShowForm((v) => !v)} style={[s.add, { backgroundColor: accent }]} testID="service-add"><AppIcon name={showForm ? "close" : "plus"} size={22} color="#FFFFFF" /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        {showForm ? (
          <Card style={{ gap: 12 }}>
            <Field label="Nom de la prestation" value={f.name} onChangeText={(v: string) => set("name", v)} testID="service-name" />
            <Field label="Description" value={f.description} onChangeText={(v: string) => set("description", v)} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}><Field label="Prix HT" value={f.unit_price_ht?.toString()} onChangeText={(v: string) => set("unit_price_ht", v)} keyboardType="numeric" testID="service-price" /></View>
              <View style={{ flex: 1 }}><Field label="Unité" value={f.unit} onChangeText={(v: string) => set("unit", v)} /></View>
              <View style={{ width: 90 }}><Field label="TVA %" value={f.vat_rate?.toString()} onChangeText={(v: string) => set("vat_rate", v)} keyboardType="numeric" /></View>
            </View>
            <Button label="Ajouter" onPress={() => create.mutate()} loading={create.isPending} disabled={!f.name} testID="service-save" />
          </Card>
        ) : null}

        {(data || []).length === 0 && !showForm ? (
          <Empty icon="tag-multiple" title="Aucune prestation" subtitle="Ajoutez vos prestations récurrentes pour accélérer vos factures." />
        ) : (
          (data || []).map((sv: any) => (
            <Card key={sv.id}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{sv.name}</Text>
                  {sv.description ? <Text style={s.desc}>{sv.description}</Text> : null}
                </View>
                <Text style={[s.price, { color: sv.unit_price_ht == null ? colors.warning : accent }]}>
                  {sv.unit_price_ht == null ? "À renseigner" : `${formatMoney(sv.unit_price_ht)}/${sv.unit}`}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  add: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  desc: { fontSize: 13, color: c.muted, marginTop: 2 },
  price: { fontSize: 15, fontWeight: "800" },
}));
