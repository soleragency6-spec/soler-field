import { useEffect, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, Linking } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Loading, ScreenHeader, StatusBadge, AppIcon, useAccent } from "@/src/components/ui";

export default function ReportEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["report", id], queryFn: () => api.get(`/reports/${id}`) });
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<any[]>([]);

  useEffect(() => {
    if (data) {
      setTitle(data.title || "");
      setSections(data.content_json?.sections || []);
    }
  }, [data]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["report", id] }); qc.invalidateQueries({ queryKey: ["documents"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const save = useMutation({
    mutationFn: () => api.put(`/reports/${id}`, { title, content_json: { ...(data.content_json || {}), sections } }),
    onSuccess: invalidate,
  });
  const validate = useMutation({
    mutationFn: () => api.put(`/reports/${id}`, { title, content_json: { ...(data.content_json || {}), sections } }).then(() => api.post(`/reports/${id}/validate`)),
    onSuccess: invalidate,
  });
  const createInvoice = useMutation({
    mutationFn: () => api.post(`/interventions/${data.intervention_id}/invoice`),
    onSuccess: (inv) => { invalidate(); router.push(`/invoice/${inv.id}`); },
  });
  const createQuote = useMutation({
    mutationFn: () => api.post(`/interventions/${data.intervention_id}/quote`),
    onSuccess: (q) => { invalidate(); router.push(`/quote/${q.id}`); },
  });

  if (isLoading || !data) return (<View style={{ flex: 1, backgroundColor: colors.surface }}><ScreenHeader title="Rapport" back /><Loading /></View>);

  const validated = data.status === "validated";
  const setSec = (i: number, v: string) => setSections((arr) => arr.map((x, idx) => (idx === i ? { ...x, body: v } : x)));
  const photos = (data.media || []).filter((m: any) => m.kind === "photo");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Rapport" back right={<StatusBadge status={data.status} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        {validated ? (
          <Card style={{ gap: 12, borderColor: colors.success }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppIcon name="check-decagram" size={22} color={colors.success} />
              <Text style={{ fontWeight: "700", color: colors.onSurface }}>Rapport validé</Text>
            </View>
            <Button label="Ouvrir le PDF" variant="secondary" icon="file-pdf-box" onPress={async () => { const r = await api.get(`/reports/${id}/pdf`); Linking.openURL(api.fileUrl(r.url)); }} testID="report-pdf" />
            <Button label="Créer la facture de cette intervention" icon="file-document" onPress={() => createInvoice.mutate()} loading={createInvoice.isPending} testID="report-create-invoice" />
            <Button label="Créer un devis" icon="file-sign" variant="secondary" onPress={() => createQuote.mutate()} loading={createQuote.isPending} testID="report-create-quote" />
            <Button label="Envoyer au client" icon="email-fast" variant="ghost" onPress={() => router.push(`/email/new?client_id=${data.client_id}&intervention_id=${data.intervention_id}&report_id=${id}`)} testID="report-send" />
          </Card>
        ) : null}

        <Card style={{ gap: 8 }}>
          <Text style={s.label}>Titre</Text>
          <TextInput style={s.titleInput} value={title} onChangeText={setTitle} editable={!validated} testID="report-title" />
        </Card>

        {sections.map((sec, i) => (
          <Card key={sec.id || i} style={{ gap: 8 }}>
            <Text style={s.secTitle}>{sec.title}</Text>
            <TextInput
              style={s.secInput}
              value={sec.body}
              onChangeText={(v) => setSec(i, v)}
              multiline
              editable={!validated}
              testID={`report-sec-${i}`}
            />
          </Card>
        ))}

        {photos.length ? (
          <Card>
            <Text style={s.secTitle}>Photos</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {photos.map((m: any) => (
                <View key={m.id} style={{ width: "48%" }}>
                  <Image source={{ uri: api.fileUrl(m.url) }} style={s.photo} contentFit="cover" />
                  {m.comment ? <Text style={s.caption}>{m.comment}</Text> : null}
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {!validated ? (
          <>
            <Button label="Enregistrer les modifications" variant="secondary" onPress={() => save.mutate()} loading={save.isPending} testID="report-save" />
            <Button label="VALIDER LE RAPPORT" icon="check-bold" onPress={() => validate.mutate()} loading={validate.isPending} testID="report-validate" />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  label: { fontSize: 13, fontWeight: "600", color: c.muted },
  titleInput: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  secTitle: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  secInput: { fontSize: 15, color: c.onSurface, lineHeight: 21, backgroundColor: c.surfaceTertiary, borderRadius: 10, padding: 12, minHeight: 70, textAlignVertical: "top", borderWidth: 1, borderColor: c.border },
  photo: { width: "100%", height: 120, borderRadius: 10 },
  caption: { fontSize: 12, color: c.muted, marginTop: 4 },
}));
