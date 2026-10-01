import { useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { Button, Card, Field, Loading, ScreenHeader, StatusBadge, AppIcon } from "@/src/components/ui";
import { formatBytes, formatDate } from "@/src/lib/format";

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const { signOut } = useApp();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["admin-workspaces"], queryFn: () => api.get("/admin/workspaces") });
  const [showCreate, setShowCreate] = useState(false);
  const [f, setF] = useState<any>({});
  const [msg, setMsg] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: string }) => api.put(`/admin/workspaces/${p.id}/status`, { subscription_status: p.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-workspaces"] }),
  });
  const createUser = useMutation({
    mutationFn: () => api.post("/admin/users", { email: f.email, password: f.password, company_name: f.company_name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-workspaces"] }); setShowCreate(false); setF({}); setMsg("Compte créé avec succès."); },
    onError: (e: any) => setMsg(e.message),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <ScreenHeader title="Super Admin" subtitle="Gestion des comptes clients"
        right={<Pressable onPress={signOut} testID="admin-logout"><AppIcon name="logout" size={24} color={colors.error} /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Button label={showCreate ? "Annuler" : "+ Créer un compte client"} variant={showCreate ? "secondary" : "primary"} onPress={() => { setShowCreate((v) => !v); setMsg(null); }} testID="admin-create-toggle" />

        {showCreate ? (
          <Card style={{ gap: 12 }}>
            <Field label="Nom de l'entreprise" value={f.company_name} onChangeText={(v: string) => setF((p: any) => ({ ...p, company_name: v }))} testID="admin-company" />
            <Field label="Email" value={f.email} onChangeText={(v: string) => setF((p: any) => ({ ...p, email: v }))} keyboardType="email-address" autoCapitalize="none" testID="admin-email" />
            <Field label="Mot de passe" value={f.password} onChangeText={(v: string) => setF((p: any) => ({ ...p, password: v }))} secureTextEntry autoCapitalize="none" testID="admin-password" />
            <Button label="Créer le compte" onPress={() => createUser.mutate()} loading={createUser.isPending} disabled={!f.email || !f.password} testID="admin-create-submit" />
          </Card>
        ) : null}

        {msg ? <Card style={{ borderColor: colors.info }}><Text style={{ color: colors.onSurface }}>{msg}</Text></Card> : null}

        {isLoading ? <Loading /> : (data || []).map((w: any) => (
          <Card key={w.id}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{w.company_name || w.name}</Text>
                <Text style={s.sub}>Inscrit le {formatDate(w.created_at)} · {w.members} membre(s)</Text>
                <Text style={s.sub}>Stockage : {formatBytes(w.storage_used)} / {formatBytes(w.storage_quota_bytes)}</Text>
              </View>
              <StatusBadge status={w.subscription_status} />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {w.subscription_status === "active" ? (
                <Button label="Suspendre" variant="danger" onPress={() => setStatus.mutate({ id: w.id, status: "suspended" })} style={{ flex: 1 }} testID={`suspend-${w.id}`} />
              ) : (
                <Button label="Activer" onPress={() => setStatus.mutate({ id: w.id, status: "active" })} style={{ flex: 1 }} testID={`activate-${w.id}`} />
              )}
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  name: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
