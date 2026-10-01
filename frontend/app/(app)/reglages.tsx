import { useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { Button, Card, Field, ScreenHeader, AppIcon, useAccent } from "@/src/components/ui";

const SWATCHES = ["#1D4ED8", "#0EA5E9", "#059669", "#DC2626", "#EA580C", "#7C3AED", "#0F172A", "#B45309"];

export default function Reglages() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();
  const { brand, signOut, refreshMe } = useApp();
  const qc = useQueryClient();

  const [form, setForm] = useState<any>({ ...(brand || {}) });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => api.put("/brand", form),
    onSuccess: () => {
      refreshMe();
      qc.invalidateQueries();
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Réglages" subtitle="Personnalisation & identité (marque blanche)" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14 }}>
          <Text style={s.section}>Identité</Text>
          <Field label="Nom de l'entreprise" value={form.company_name} onChangeText={(v: string) => set("company_name", v)} testID="brand-company" />
          <Field label="Nom de l'application" value={form.app_name} onChangeText={(v: string) => set("app_name", v)} />
          <Text style={s.label}>Couleur principale</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {SWATCHES.map((c) => (
              <Pressable key={c} onPress={() => set("primary_color", c)} style={[s.swatch, { backgroundColor: c, borderWidth: form.primary_color === c ? 3 : 0, borderColor: colors.onSurface }]} testID={`swatch-${c}`} />
            ))}
          </View>
          <Field label="Couleur secondaire (hex)" value={form.secondary_color} onChangeText={(v: string) => set("secondary_color", v)} autoCapitalize="none" />
        </Card>

        <Card style={{ gap: 14 }}>
          <Text style={s.section}>Coordonnées</Text>
          <Field label="Contact" value={form.contact_name} onChangeText={(v: string) => set("contact_name", v)} />
          <Field label="Téléphone" value={form.phone} onChangeText={(v: string) => set("phone", v)} keyboardType="phone-pad" />
          <Field label="Email" value={form.email} onChangeText={(v: string) => set("email", v)} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Site web" value={form.website} onChangeText={(v: string) => set("website", v)} autoCapitalize="none" />
          <Field label="Adresse" value={form.address} onChangeText={(v: string) => set("address", v)} multiline />
        </Card>

        <Card style={{ gap: 14 }}>
          <Text style={s.section}>Légal & facturation</Text>
          <Field label="SIRET" value={form.siret} onChangeText={(v: string) => set("siret", v)} />
          <Field label="N° TVA" value={form.vat_number} onChangeText={(v: string) => set("vat_number", v)} />
          <Field label="IBAN" value={form.iban} onChangeText={(v: string) => set("iban", v)} autoCapitalize="characters" />
          <Field label="Taux de TVA (%)" value={String(form.vat_rate ?? "")} onChangeText={(v: string) => set("vat_rate", parseFloat(v) || 0)} keyboardType="numeric" />
          <Field label="Conditions de paiement" value={form.payment_terms} onChangeText={(v: string) => set("payment_terms", v)} multiline />
          <Field label="Mentions légales" value={form.legal_notices} onChangeText={(v: string) => set("legal_notices", v)} multiline />
          <Field label="Préfixe facture" value={form.invoice_prefix} onChangeText={(v: string) => set("invoice_prefix", v)} autoCapitalize="characters" />
          <Field label="Signature email" value={form.email_signature} onChangeText={(v: string) => set("email_signature", v)} multiline />
        </Card>

        <Button label={save.isSuccess ? "Enregistré ✓" : "Enregistrer"} onPress={() => save.mutate()} loading={save.isPending} testID="brand-save" />

        <Card onPress={() => router.push("/templates")} testID="link-templates">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AppIcon name="file-cog" size={24} color={accent} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Modèles de documents</Text>
            <AppIcon name="chevron-right" size={22} color={colors.borderStrong} />
          </View>
        </Card>

        <Card onPress={() => router.push("/services")} testID="link-services">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AppIcon name="tag-multiple" size={24} color={accent} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Prestations & Tarifs</Text>
            <AppIcon name="chevron-right" size={22} color={colors.borderStrong} />
          </View>
        </Card>

        <Button label="Se déconnecter" variant="danger" icon="logout" onPress={signOut} testID="logout" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  section: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  label: { color: c.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  swatch: { width: 40, height: 40, borderRadius: 12 },
}));
