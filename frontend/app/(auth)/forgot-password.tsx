import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/src/lib/supabase";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Field, ScreenHeader, AppIcon } from "@/src/components/ui";

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    setDone(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Mot de passe oublié" back />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={{ alignItems: "center", gap: 12, marginTop: 40 }}>
            <AppIcon name="email-check-outline" size={54} color={colors.success} />
            <Text style={s.title}>Email envoyé</Text>
            <Text style={s.subtitle}>Si un compte existe pour {email}, vous recevrez un lien de réinitialisation.</Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <Text style={s.subtitle}>Entrez votre email pour recevoir un lien de réinitialisation.</Text>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="vous@entreprise.fr" keyboardType="email-address" autoCapitalize="none" testID="forgot-email" />
            <Button label="Envoyer le lien" onPress={submit} loading={loading} testID="forgot-submit" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  subtitle: { fontSize: 15, color: c.muted, textAlign: "center", lineHeight: 21 },
}));
