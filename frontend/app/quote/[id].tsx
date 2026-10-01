import { useEffect, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Field, Loading, ScreenHeader, StatusBadge, AppIcon, useAccent } from "@/src/components/ui";
import { formatMoney } from "@/src/lib/format";

export default function QuoteEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => api.get(`/quotes/${id}`) });
  const [items, setItems] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [valid, setValid] = useState("");

  useEffect(() => { if (data) { setItems(data.items || []); setNotes(data.notes || ""); setValid(data.valid_until || ""); } }, [data]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["quote", id] }); qc.invalidateQueries({ queryKey: ["documents"] }); };
  const norm = () => items.map((it) => ({ description: it.description || "", quantity: parseFloat(it.quantity) || 0, unit: it.unit || "u", unit_price_ht: it.unit_price_ht === "" || it.unit_price_ht == null ? null : parseFloat(it.unit_price_ht), vat_rate: parseFloat(it.vat_rate) || 20 }));
  const save = useMutation({ mutationFn: () => api.put(`/quotes/${id}`, { items: norm(), notes, valid_until: valid || null }), onSuccess: invalidate });
  const finalize = useMutation({ mutationFn: () => api.put(`/quotes/${id}`, { items: norm(), notes, valid_until: valid || null }).then(() => api.post(`/quotes/${id}/finalize`)), onSuccess: invalidate });
  const convert = useMutation({ mutationFn: () => api.post('/quotes/' + id + '/convert-to-invoice', {}), onSuccess: (result: any) => router.push({ pathname: '/invoice/[id]', params: { id: result.invoice.id } }), onError: () => undefined });
  const markSent = useMutation({ mutationFn: () => api.post(`/quotes/${id}/status`, { status: "sent" }), onSuccess: invalidate });

  if (isLoading || !data) return (<View style={{ flex: 1, backgroundColor: colors.surface }}><ScreenHeader title="Devis" back /><Loading /></View>);

  const locked = ["final", "sent", "accepted"].includes(data.status);
  const setItem = (i: number, k: string, v: string) => setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const addItem = () => setItems((a) => [...a, { description: "", quantity: 1, unit: "u", unit_price_ht: null, vat_rate: 20 }]);
  const removeItem = (i: number) => setItems((a) => a.filter((_, idx) => idx !== i));
  const subtotal = items.reduce((acc, it) => acc + (it.unit_price_ht ? parseFloat(it.unit_price_ht) * (parseFloat(it.quantity) || 0) : 0), 0);
  const vat = items.reduce((acc, it) => acc + (it.unit_price_ht ? parseFloat(it.unit_price_ht) * (parseFloat(it.quantity) || 0) * (parseFloat(it.vat_rate) || 0) / 100 : 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title={data.number || "Devis (brouillon)"} back right={<StatusBadge status={data.status} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        {locked ? (
          <Card style={{ gap: 12, borderColor: colors.success }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppIcon name="file-check" size={22} color={colors.success} />
              <Text style={{ fontWeight: "700", color: colors.onSurface }}>Devis validé · {data.number}</Text>
            </View>
            <Button label="Ouvrir le PDF" variant="secondary" icon="file-pdf-box" onPress={async () => { const r = await api.get(`/quotes/${id}/pdf`); Linking.openURL(api.fileUrl(r.url)); }} testID="quote-pdf" />
            <Button label="Envoyer au client" icon="email-fast" onPress={() => { markSent.mutate(); router.push(`/email/new?client_id=${data.client_id}&intervention_id=${data.intervention_id || ""}&quote_id=${id}`); }} testID="quote-send" />
          </Card>
        ) : null}

        {items.map((it, i) => (
          <Card key={i} style={{ gap: 8 }}>
            <TextInput style={s.desc} value={it.description} onChangeText={(v) => setItem(i, "description", v)} placeholder="Désignation" placeholderTextColor={colors.muted} editable={!locked} testID={`qitem-desc-${i}`} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Cell label="Qté" value={String(it.quantity ?? "")} onChange={(v: string) => setItem(i, "quantity", v)} editable={!locked} />
              <Cell label="PU HT" value={it.unit_price_ht == null ? "" : String(it.unit_price_ht)} onChange={(v: string) => setItem(i, "unit_price_ht", v)} editable={!locked} placeholder="À renseigner" testID={`qitem-price-${i}`} />
              <Cell label="TVA%" value={String(it.vat_rate ?? "")} onChange={(v: string) => setItem(i, "vat_rate", v)} editable={!locked} />
            </View>
            {!locked ? <Pressable onPress={() => removeItem(i)}><Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>Supprimer la ligne</Text></Pressable> : null}
          </Card>
        ))}
        {!locked ? <Button label="+ Ajouter une ligne" variant="ghost" onPress={addItem} testID="quote-add-item" /> : null}

        {!locked ? (
          <Card style={{ gap: 12 }}>
            <Field label="Validité (date)" value={valid} onChangeText={setValid} placeholder="AAAA-MM-JJ" testID="quote-valid" />
            <Field label="Conditions / notes" value={notes} onChangeText={setNotes} multiline testID="quote-notes" />
          </Card>
        ) : null}

        <Card style={{ gap: 6 }}>
          <Row label="Total HT" value={formatMoney(locked ? data.subtotal_ht : subtotal)} />
          <Row label="TVA" value={formatMoney(locked ? data.vat_amount : vat)} />
          <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 4 }} />
          <Row label="Total TTC" value={formatMoney(locked ? data.total_ttc : subtotal + vat)} strong accent={accent} />
        </Card>

        {!locked ? (
          <>
            <Button label="Enregistrer" variant="secondary" onPress={() => save.mutate()} loading={save.isPending} testID="quote-save" />
            {data.status === "accepted" ? <Button label="Convertir en facture" variant="primary" onPress={() => convert.mutate()} loading={convert.isPending} testID="quote-convert-invoice" /> : null}
      <Button label="VALIDER LE DEVIS" icon="check-bold" onPress={() => finalize.mutate()} loading={finalize.isPending} testID="quote-finalize" />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Cell({ label, value, onChange, editable, placeholder, testID }: any) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.cellLabel}>{label}</Text>
      <TextInput style={s.cell} value={value} onChangeText={onChange} editable={editable} keyboardType="numeric" placeholder={placeholder} placeholderTextColor={colors.muted} testID={testID} />
    </View>
  );
}
function Row({ label, value, strong, accent }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: strong ? 16 : 14, fontWeight: strong ? "800" : "500", color: strong ? colors.onSurface : colors.muted }}>{label}</Text>
      <Text style={{ fontSize: strong ? 18 : 14, fontWeight: strong ? "800" : "600", color: strong ? accent : colors.onSurface }}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  desc: { fontSize: 16, fontWeight: "600", color: c.onSurface, borderBottomWidth: 1, borderBottomColor: c.divider, paddingBottom: 6 },
  cellLabel: { fontSize: 11, color: c.muted, fontWeight: "600", marginBottom: 4 },
  cell: { backgroundColor: c.surfaceTertiary, borderRadius: 8, padding: 10, fontSize: 15, color: c.onSurface, borderWidth: 1, borderColor: c.border },
}));
