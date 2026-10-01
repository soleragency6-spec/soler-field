import { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { Button, Card, Field, ScreenHeader, AppIcon, useAccent } from "@/src/components/ui";

export default function NewEmail() {
  const params = useLocalSearchParams<{ client_id?: string; intervention_id?: string; report_id?: string; invoice_id?: string; quote_id?: string }>();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const qc = useQueryClient();

  const { brand } = useApp();
  const { data: client } = useQuery({ queryKey: ["client", params.client_id], queryFn: () => api.get(`/clients/${params.client_id}`), enabled: !!params.client_id });

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [incReport, setIncReport] = useState(!!params.report_id);
  const [incInvoice, setIncInvoice] = useState(!!params.invoice_id);
  const [incQuote, setIncQuote] = useState(!!params.quote_id);
  const [result, setResult] = useState<{ status: string; enabled: boolean } | null>(null);

  useEffect(() => {
    if (client?.client?.email) setRecipient(client.client.email);
  }, [client]);
  useEffect(() => {
    const company = brand?.company_name || "notre entreprise";
    setSubject(`Vos documents — ${company}`);
    setBody(`Bonjour,\n\nVeuillez trouver ci-joint vos documents relatifs à votre intervention.\n\nCordialement,`);
  }, [brand]);

  const send = useMutation({
    mutationFn: async () => {
      const attachments: any[] = [];
      if (incReport && params.report_id) attachments.push({ type: "report", id: params.report_id, name: "rapport.pdf" });
      if (incInvoice && params.invoice_id) attachments.push({ type: "invoice", id: params.invoice_id, name: "facture.pdf" });
      if (incQuote && params.quote_id) attachments.push({ type: "quote", id: params.quote_id, name: "devis.pdf" });
      const email = await api.post("/emails", { client_id: params.client_id, intervention_id: params.intervention_id, recipient, subject, body, attachments });
      const res = await api.post(`/emails/${email.id}/send`);
      return res;
    },
    onSuccess: (res) => { setResult({ status: res.email.status, enabled: res.email_enabled }); qc.invalidateQueries({ queryKey: ["client", params.client_id] }); },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Envoyer au client" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Field label="Destinataire" value={recipient} onChangeText={setRecipient} keyboardType="email-address" autoCapitalize="none" testID="email-recipient" />
        <Field label="Objet" value={subject} onChangeText={setSubject} testID="email-subject" />
        <Field label="Message" value={body} onChangeText={setBody} multiline testID="email-body" />

        <Card style={{ gap: 12 }}>
          <Text style={s.section}>Pièces jointes</Text>
          {params.report_id ? <Toggle label="Rapport (PDF)" on={incReport} onToggle={() => setIncReport((v) => !v)} accent={accent} testID="att-report" /> : null}
          {params.invoice_id ? <Toggle label="Facture (PDF)" on={incInvoice} onToggle={() => setIncInvoice((v) => !v)} accent={accent} testID="att-invoice" /> : null}
          {params.quote_id ? <Toggle label="Devis (PDF)" on={incQuote} onToggle={() => setIncQuote((v) => !v)} accent={accent} testID="att-quote" /> : null}
          {!params.report_id && !params.invoice_id && !params.quote_id ? <Text style={{ color: colors.muted }}>Aucun document lié.</Text> : null}
        </Card>

        {result ? (
          <Card style={{ borderColor: result.status === "sent" ? colors.success : colors.warning, gap: 6 }}>
            <Text style={{ fontWeight: "800", color: colors.onSurface }}>
              {result.status === "sent" ? "Email envoyé ✓" : "Email en attente"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {result.enabled ? "L'email a été transmis au client." : "L'envoi d'email n'est pas encore activé (clé Resend non configurée). L'email est enregistré en attente et partira dès l'activation."}
            </Text>
          </Card>
        ) : null}

        <Button label="Envoyer" icon="email-fast" onPress={() => send.mutate()} loading={send.isPending} disabled={!recipient} testID="email-send" />
      </ScrollView>
    </View>
  );
}

function Toggle({ label, on, onToggle, accent, testID }: any) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID={testID}>
      <AppIcon name={on ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={on ? accent : colors.borderStrong} />
      <Text style={{ fontSize: 15, color: colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({ section: { fontSize: 15, fontWeight: "800", color: c.onSurface } }));
