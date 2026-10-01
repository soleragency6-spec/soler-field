import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator, Text } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AppProvider, useApp } from "@/src/context/AppContext";

LogBox.ignoreAllLogs(true);

function RootNav() {
  const { session, initializing, me } = useApp();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/sign-in");
    else if (session && inAuth) router.replace("/(app)");
  }, [session, initializing, segments, router]);

  // Route admins to their dashboard once profile is known
  useEffect(() => {
    if (session && me?.is_admin && segments[0] === "(app)") router.replace("/admin");
  }, [session, me, segments, router]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator size="large" color="#E21B2D" />
        <Text style={{ marginTop: 12, color: "#6B7280", fontWeight: "600" }}>Chargement…</Text>
      </View>
    );
  }
  return <Slot />;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <AppProvider>
              <RootNav />
            </AppProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
