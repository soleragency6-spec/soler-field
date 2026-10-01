import { ScrollView, View, Text, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Card, Loading, ScreenHeader, StatusBadge, AppIcon, useAccent, Button } from "@/src/components/ui";
import { clientName, formatDate, formatMoney, statusLabel } from "@/src/lib/format";

export default function Client360() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const router = useRouter();

  const { data, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => api.get(`/clients/${id}`) });

  if (isLoading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Client" back />
        <Loading />
      </View>
    );
  }
  const c = data.client;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title={clientName(c)} subtitle={c.customer_number || undefined} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <Card style={{ gap: 10 }}>
          {c.phone ? <ContactRow icon="phone" text={c.phone} onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
          {c.email ? <ContactRow icon="email" text={c.email} onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
          {c.service_address ? <ContactRow icon="map-marker" text={c.service_address} /> : null}
          {c.notes ? <ContactRow icon="note-text" text={c.notes} /> : null}
        </Card>

        <Button label="Nouvelle intervention" icon="plus" onPress={() => router.push(`/intervention/new?client_id=${c.id}`)} testID="client-new-intervention" />

        <Section title="Interventions" count={data.interventions.length}>
          {data.interventions.map((it: any) => (
            <Pressable key={it.id} style={s.row} onPress={() => router.push(`/intervention/${it.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowT} numberOfLines={1}>{it.name}</Text>
                <Text style={s.rowS}>{formatDate(it.created_at)}</Text>
              </View>
              <StatusBadge status={it.status} />
            </Pressable>
          ))}
        </Section>

        <Section title="Factures" count={data.invoices.length}>
          {data.invoices.map((iv: any) => (
            <Pressable key={iv.id} style={s.row} onPress={() => router.push(`/invoice/${iv.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowT}>{iv.number || "Brouillon"}</Text>
                <Text style={s.rowS}>{formatMoney(iv.total_ttc)}</Text>
              </View>
              <StatusBadge status={iv.status} />
            </Pressable>
          ))}
        </Section>

        <Section title="Rapports" count={data.reports.length}>
          {data.reports.map((r: any) => (
            <Pressable key={r.id} style={s.row} onPress={() => router.push(`/report/${r.id}`)}>
              <Text style={[s.rowT, { flex: 1 }]} numberOfLines={1}>{r.title}</Text>
              <StatusBadge status={r.status} />
            </Pressable>
          ))}
        </Section>

        <Section title="Emails" count={data.emails.length}>
          {data.emails.map((e: any) => (
            <View key={e.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowT} numberOfLines={1}>{e.subject || "(sans objet)"}</Text>
                <Text style={s.rowS}>{e.recipient} · {formatDate(e.created_at)}</Text>
              </View>
              <StatusBadge status={e.status} />
            </View>
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

function ContactRow({ icon, text, onPress }: any) {
  const { colors } = useTheme();
  const accent = useAccent();
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <AppIcon name={icon} size={20} color={accent} />
      <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }}>{text}</Text>
      {onPress ? <AppIcon name="chevron-right" size={20} color={colors.borderStrong} /> : null}
    </Pressable>
  );
}

function Section({ title, count, children }: any) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Card>
      <Text style={s.sectionTitle}>{title} <Text style={{ color: colors.muted }}>· {count}</Text></Text>
      {count === 0 ? <Text style={{ color: colors.muted, marginTop: 8 }}>Aucun élément.</Text> : <View style={{ marginTop: 4 }}>{children}</View>}
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  sectionTitle: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.divider },
  rowT: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  rowS: { fontSize: 13, color: c.muted, marginTop: 2 },
}));
