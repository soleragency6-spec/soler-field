import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { Button, Field, ScreenHeader } from "@/src/components/ui";

export default function NewClient() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const set = (k: string, v: string) => setF((p: any) => ({ ...p, [k]: v }));

  const create = useMutation({
    mutationFn: () => api.post("/clients", f),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      router.replace(`/client/${c.id}`);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Nouveau client" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Field label="Société" value={f.company} onChangeText={(v: string) => set("company", v)} testID="client-company" />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Prénom" value={f.first_name} onChangeText={(v: string) => set("first_name", v)} testID="client-first" /></View>
          <View style={{ flex: 1 }}><Field label="Nom" value={f.last_name} onChangeText={(v: string) => set("last_name", v)} testID="client-last" /></View>
        </View>
        <Field label="Email" value={f.email} onChangeText={(v: string) => set("email", v)} keyboardType="email-address" autoCapitalize="none" testID="client-email" />
        <Field label="Téléphone" value={f.phone} onChangeText={(v: string) => set("phone", v)} keyboardType="phone-pad" testID="client-phone" />
        <Field label="Adresse de facturation" value={f.billing_address} onChangeText={(v: string) => set("billing_address", v)} multiline />
        <Field label="Adresse d'intervention" value={f.service_address} onChangeText={(v: string) => set("service_address", v)} multiline />
        <Field label="Notes internes" value={f.notes} onChangeText={(v: string) => set("notes", v)} multiline />
        <Button label="Créer le client" onPress={() => create.mutate()} loading={create.isPending} testID="client-save" />
      </ScrollView>
    </View>
  );
}
