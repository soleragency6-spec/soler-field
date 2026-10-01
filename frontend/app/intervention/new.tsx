import { useState } from "react";
import { ScrollView, View, Text, Pressable, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Field, ScreenHeader, AppIcon, useAccent } from "@/src/components/ui";
import { clientName } from "@/src/lib/format";

export default function NewIntervention() {
  const params = useLocalSearchParams<{ client_id?: string }>();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string | undefined>(params.client_id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const clients = useQuery({ queryKey: ["clients", ""], queryFn: () => api.get("/clients") });
  const selectedClient = (clients.data || []).find((c: any) => c.id === clientId);

  const create = useMutation({
    mutationFn: () => api.post("/interventions", { name: name || "Intervention", type, description, client_id: clientId }),
    onSuccess: (iv) => {
      qc.invalidateQueries({ queryKey: ["interventions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      router.replace(`/intervention/${iv.id}`);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Nouvelle intervention" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Pressable style={s.clientBox} onPress={() => setPickerOpen(true)} testID="pick-client">
          <AppIcon name="account" size={22} color={accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.clientLabel}>Client</Text>
            <Text style={s.clientValue}>{selectedClient ? clientName(selectedClient) : "Sélectionner un client (facultatif)"}</Text>
          </View>
          <AppIcon name="chevron-right" size={22} color={colors.borderStrong} />
        </Pressable>

        <Field label="Nom de l'intervention" value={name} onChangeText={setName} placeholder="Ex : Recherche de fuite" testID="interv-name" />
        <Field label="Type" value={type} onChangeText={setType} placeholder="Ex : Plomberie, Dépannage…" testID="interv-type" />
        <Field label="Description" value={description} onChangeText={setDescription} placeholder="Contexte de l'intervention" multiline testID="interv-desc" />

        <Button label="Démarrer l'intervention" icon="play" onPress={() => create.mutate()} loading={create.isPending} testID="interv-start" />
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          <ScreenHeader title="Choisir un client" right={<Pressable onPress={() => setPickerOpen(false)} testID="picker-close"><AppIcon name="close" size={26} color={colors.onSurface} /></Pressable>} />
          <View style={{ padding: 16 }}>
            <Button label="+ Nouveau client" variant="secondary" onPress={() => { setPickerOpen(false); router.push("/client/new"); }} testID="picker-new-client" />
          </View>
          <FlatList
            data={clients.data || []}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
            renderItem={({ item }) => (
              <Pressable style={s.pickRow} onPress={() => { setClientId(item.id); setPickerOpen(false); }} testID={`pick-${item.id}`}>
                <AppIcon name="account-circle" size={30} color={accent} />
                <Text style={{ flex: 1, fontSize: 16, color: colors.onSurface }}>{clientName(item)}</Text>
                {clientId === item.id ? <AppIcon name="check" size={22} color={colors.success} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  clientBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
  clientLabel: { fontSize: 12, color: c.muted, fontWeight: "600" },
  clientValue: { fontSize: 15, color: c.onSurface, fontWeight: "600", marginTop: 2 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider },
}));
