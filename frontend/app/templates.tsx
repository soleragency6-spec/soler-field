import { useState } from "react";
import { ScrollView, View, Text, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Empty, Loading, ScreenHeader, AppIcon, useAccent } from "@/src/components/ui";

const KINDS = [
  { key: "report", label: "Rapports", icon: "clipboard-text" },
  { key: "invoice", label: "Factures", icon: "file-document" },
  { key: "quote", label: "Devis", icon: "file-sign" },
];

export default function Templates() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const qc = useQueryClient();
  const [kind, setKind] = useState("report");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["templates", kind], queryFn: () => api.get(`/templates?kind=${kind}`) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["templates", kind] });
  const setDefault = useMutation({ mutationFn: (id: string) => api.put(`/templates/${id}`, { is_default: true }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/templates/${id}`), onSuccess: invalidate });

  const upload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*"], copyToCacheDirectory: true });
    if (res.canceled) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      const name = asset.name || "modele";
      const type = asset.mimeType || "application/octet-stream";
      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: asset.uri, name, type } as any);
      }
      form.append("kind", kind);
      form.append("name", name);
      await api.upload("/templates", form);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Modèles de documents" subtitle="Vos modèles priment sur les mises en page génériques" back />
      <View style={s.segment}>
        {KINDS.map((k) => {
          const active = k.key === kind;
          return (
            <Pressable key={k.key} onPress={() => setKind(k.key)} style={[s.seg, active && { backgroundColor: accent }]} testID={`tmpl-tab-${k.key}`}>
              <Text style={{ color: active ? "#FFFFFF" : colors.onSurfaceTertiary, fontWeight: "700", fontSize: 14 }}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <Button label={busy ? "Import en cours…" : "Importer un modèle (PDF / DOCX)"} icon="upload" onPress={upload} loading={busy} testID="tmpl-upload" />
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          L’application analyse la structure de votre document (sections, ordre) pour reproduire votre mise en page lors de la génération.
        </Text>

        {isLoading ? <Loading /> : (data || []).length === 0 ? (
          <Empty icon="file-upload" title="Aucun modèle" subtitle="Importez votre modèle existant pour qu'il soit réutilisé automatiquement." />
        ) : (
          (data || []).map((t: any) => (
            <Card key={t.id}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <AppIcon name={t.structure_json?.source === "docx" ? "file-word" : t.structure_json?.source === "image" ? "file-image" : "file-pdf-box"} size={28} color={accent} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{t.name}</Text>
                  <Text style={s.sub}>{t.structure_json?.detected?.section_count ?? 0} section(s) détectée(s)</Text>
                </View>
                {t.is_default ? <View style={[s.badge, { backgroundColor: colors.success }]}><Text style={s.badgeT}>Par défaut</Text></View> : null}
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                {!t.is_default ? <Button label="Définir par défaut" variant="secondary" onPress={() => setDefault.mutate(t.id)} style={{ flex: 1 }} testID={`tmpl-default-${t.id}`} /> : null}
                <Button label="Aperçu" variant="ghost" onPress={async () => { const r = await api.get(`/templates/${t.id}/original`); Linking.openURL(api.fileUrl(r.url)); }} style={{ flex: 1 }} />
                <Button label="Suppr." variant="danger" onPress={() => remove.mutate(t.id)} style={{ width: 90 }} testID={`tmpl-del-${t.id}`} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  segment: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  seg: { flex: 1, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  name: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeT: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
}));
