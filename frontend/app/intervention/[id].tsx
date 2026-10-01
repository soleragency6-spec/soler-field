import { useState } from "react";
import { ScrollView, View, Text, Pressable, Platform, Linking } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Loading, ScreenHeader, StatusBadge, AppIcon, useAccent } from "@/src/components/ui";
import { VoiceCapture } from "@/src/components/VoiceCapture";
import { clientName, formatTime } from "@/src/lib/format";

async function assetToUpload(asset: ImagePicker.ImagePickerAsset, kind: string, comment: string) {
  const form = new FormData();
  const name = asset.fileName || `${kind}_${Date.now()}.${kind === "video" ? "mp4" : "jpg"}`;
  const type = asset.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg");
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri: asset.uri, name, type } as any);
  }
  form.append("kind", kind);
  form.append("comment", comment || "");
  return form;
}

export default function FieldMode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const qc = useQueryClient();

  const [voiceKind, setVoiceKind] = useState<null | "voice" | "note">(null);
  const [captionFor, setCaptionFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permMsg, setPermMsg] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({ queryKey: ["intervention", id], queryFn: () => api.get(`/interventions/${id}`) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["intervention", id] }); qc.invalidateQueries({ queryKey: ["interventions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const addEvent = useMutation({
    mutationFn: (payload: any) => api.post(`/interventions/${id}/events`, payload),
    onSuccess: invalidate,
  });

  const generate = useMutation({
    mutationFn: () => api.post(`/interventions/${id}/report/generate`),
    onSuccess: (rep) => { invalidate(); router.push(`/report/${rep.id}`); },
  });

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setPermMsg(perm.canAskAgain ? "Autorisez l'accès à la caméra pour prendre des photos." : "L'accès à la caméra est bloqué. Ouvrez les réglages pour l'activer.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) await handleUpload(res.assets[0], "photo");
  };

  const pickMedia = async (kind: "photo" | "video") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPermMsg(perm.canAskAgain ? "Autorisez l'accès aux médias." : "L'accès aux médias est bloqué. Ouvrez les réglages.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kind === "video" ? "videos" : "images", quality: 0.6 });
    if (!res.canceled) await handleUpload(res.assets[0], kind);
  };

  const handleUpload = async (asset: ImagePicker.ImagePickerAsset, kind: "photo" | "video") => {
    setBusy(true);
    try {
      const form = await assetToUpload(asset, kind, "");
      const media = await api.upload(`/interventions/${id}/media`, form);
      invalidate();
      await refetch();
      if (kind === "photo") setCaptionFor(media.id);
    } finally {
      setBusy(false);
    }
  };

  const saveCaption = useMutation({
    mutationFn: (payload: { mid: string; comment: string }) => api.put(`/media/${payload.mid}`, { comment: payload.comment }),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Intervention" back />
        <Loading />
      </View>
    );
  }

  const iv = data.intervention;
  const events = data.events || [];
  const mediaById: Record<string, any> = {};
  (data.media || []).forEach((m: any) => (mediaById[m.id] = m));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title={iv.name} subtitle={data.client ? clientName(data.client) : "Sans client"} back right={<StatusBadge status={iv.status} />} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120, gap: 16 }}>
        <View style={s.grid}>
          <ActionBtn icon="microphone" label="Dicter" color={accent} onPress={() => setVoiceKind("voice")} testID="act-voice" />
          <ActionBtn icon="camera" label="Photo" color={accent} onPress={takePhoto} testID="act-photo" />
          <ActionBtn icon="video" label="Vidéo" color={accent} onPress={() => pickMedia("video")} testID="act-video" />
          <ActionBtn icon="pencil" label="Note" color={accent} onPress={() => setVoiceKind("note")} testID="act-note" />
        </View>
        <Pressable onPress={() => pickMedia("photo")} testID="act-gallery">
          <Text style={{ color: accent, fontWeight: "600", textAlign: "center" }}>+ Importer une photo depuis la galerie</Text>
        </Pressable>

        {busy ? <Card><Text style={{ color: colors.muted }}>Téléversement en cours…</Text></Card> : null}
        {permMsg ? (
          <Card style={{ gap: 10, borderColor: colors.warning }}>
            <Text style={{ color: colors.onSurface }}>{permMsg}</Text>
            <Button label="Ouvrir les réglages" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        ) : null}

        <Text style={s.timelineTitle}>Déroulé de l’intervention</Text>
        {events.length === 0 ? (
          <Text style={{ color: colors.muted }}>Utilisez les boutons ci-dessus pour documenter l’intervention.</Text>
        ) : (
          events.map((ev: any) => {
            const media = ev.media_id ? mediaById[ev.media_id] : null;
            return (
              <View key={ev.id} style={s.tlRow}>
                <View style={{ alignItems: "center", width: 46 }}>
                  <Text style={s.tlTime}>{formatTime(ev.ts)}</Text>
                  <View style={[s.dot, { backgroundColor: accent }]} />
                </View>
                <Card style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: media || ev.content || ev.transcript ? 6 : 0 }}>
                    <AppIcon name={iconFor(ev.kind)} size={18} color={accent} />
                    <Text style={s.tlKind}>{labelFor(ev.kind)}</Text>
                  </View>
                  {media && media.kind === "photo" ? (
                    <Image source={{ uri: api.fileUrl(media.url) }} style={s.thumb} contentFit="cover" />
                  ) : null}
                  {media && media.kind === "video" ? (
                    <View style={[s.thumb, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }]}>
                      <AppIcon name="play-circle" size={40} color={accent} />
                    </View>
                  ) : null}
                  {ev.transcript ? <Text style={s.tlText}>{ev.transcript}</Text> : null}
                  {ev.content && ev.content !== ev.transcript ? <Text style={s.tlText}>{ev.content}</Text> : null}
                  {media && media.kind === "photo" ? (
                    <Pressable onPress={() => setCaptionFor(media.id)} style={{ marginTop: 6 }}>
                      <Text style={{ color: accent, fontWeight: "600", fontSize: 13 }}>{media.comment ? "Modifier la légende" : "Ajouter une légende"}</Text>
                    </Pressable>
                  ) : null}
                </Card>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label="GÉNÉRER LE RAPPORT"
          icon="file-document-edit"
          onPress={() => generate.mutate()}
          loading={generate.isPending}
          testID="generate-report"
        />
      </View>

      <VoiceCapture
        visible={!!voiceKind}
        title={voiceKind === "voice" ? "Dicter une note" : "Note écrite"}
        onClose={() => setVoiceKind(null)}
        onSave={(text) => { addEvent.mutate({ kind: voiceKind, transcript: text }); setVoiceKind(null); }}
      />
      <VoiceCapture
        visible={!!captionFor}
        title="Légende de la photo"
        initial={captionFor ? mediaById[captionFor]?.comment || "" : ""}
        onClose={() => setCaptionFor(null)}
        onSave={(text) => { if (captionFor) saveCaption.mutate({ mid: captionFor, comment: text }); setCaptionFor(null); }}
      />
    </View>
  );
}

function ActionBtn({ icon, label, color, onPress, testID }: any) {
  const s = useStyles();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.action, { borderColor: color }, pressed && { opacity: 0.85 }]} testID={testID}>
      <View style={[s.actionIcon, { backgroundColor: color }]}>
        <AppIcon name={icon} size={26} color="#FFFFFF" />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function iconFor(k: string) { return { start: "flag", voice: "microphone", photo: "camera", video: "video", note: "pencil" }[k] || "circle"; }
function labelFor(k: string) { return { start: "Intervention démarrée", voice: "Note vocale", photo: "Photo", video: "Vidéo", note: "Note" }[k] || k; }

const useStyles = makeStyles((c) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: { width: "47%", flexGrow: 1, backgroundColor: c.surface, borderRadius: 16, paddingVertical: 20, alignItems: "center", gap: 10, borderWidth: 1.5 },
  actionIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  timelineTitle: { fontSize: 16, fontWeight: "800", color: c.onSurface, marginTop: 4 },
  tlRow: { flexDirection: "row", gap: 8 },
  tlTime: { fontSize: 11, color: c.muted, fontWeight: "600" },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  tlKind: { fontSize: 13, fontWeight: "700", color: c.onSurfaceSecondary },
  tlText: { fontSize: 15, color: c.onSurface, lineHeight: 21 },
  thumb: { width: "100%", height: 180, borderRadius: 12, marginBottom: 6 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider },
}));
