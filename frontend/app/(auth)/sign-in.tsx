import { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/src/lib/supabase";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Field, AppIcon } from "@/src/components/ui";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    if (!email || !password) {
      setError("Veuillez renseigner votre email et mot de passe.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "Email ou mot de passe incorrect."
          : "Connexion impossible. Vérifiez vos identifiants."
      );
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: insets.top + 48, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View style={s.brandLockup}>
          <View style={s.logo}>
            <Text style={s.logoMark}>S</Text>
          </View>
          <Text style={s.agency}>SOLER AGENCY</Text>
          <View style={s.redRule} />
        </View>
        <Text style={s.title}>SOLER</Text>
        <Text style={s.subtitle}>Pilotez vos interventions, vos rapports et vos factures depuis un seul espace.</Text>

        <View style={s.form}>
          <Field label="Email professionnel" value={email} onChangeText={setEmail} placeholder="vous@entreprise.fr" keyboardType="email-address" autoCapitalize="none" testID="signin-email" />
          <Field label="Mot de passe" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoCapitalize="none" testID="signin-password" />
          {error ? (
            <View style={s.error}>
              <AppIcon name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={{ color: colors.error, flex: 1, fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}
          <Button label="Se connecter" onPress={signIn} loading={loading} testID="signin-submit" />
          <Button label="Mot de passe oublié ?" variant="ghost" onPress={() => router.push("/(auth)/forgot-password")} testID="signin-forgot" style={{ borderWidth: 0 }} />
        </View>
        <Text style={s.footer}>Espace professionnel SOLER AGENCY · Accès sécurisé</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: "#090909" },
  brandLockup: { alignItems: "center", marginBottom: 22 },
  logo: { width: 78, height: 78, borderRadius: 22, backgroundColor: "#E21B2D", alignItems: "center", justifyContent: "center", marginBottom: 14, shadowColor: "#E21B2D", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  logoMark: { color: "#FFFFFF", fontSize: 48, fontWeight: "900", fontStyle: "italic", letterSpacing: -4 },
  agency: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", letterSpacing: 3.2 },
  redRule: { width: 42, height: 3, borderRadius: 2, backgroundColor: "#E21B2D", marginTop: 12 },
  title: { fontSize: 32, fontWeight: "900", letterSpacing: 1.5, color: "#FFFFFF", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#A3A3A3", textAlign: "center", marginTop: 10, lineHeight: 22 },
  form: { gap: 16, marginTop: 34, padding: 20, borderRadius: 20, backgroundColor: "#141414", borderWidth: 1, borderColor: "#2A2A2A" },
  error: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#35151A", padding: 12, borderRadius: 12 },
  footer: { fontSize: 12, color: "#777777", textAlign: "center", marginTop: 26 },
}));
