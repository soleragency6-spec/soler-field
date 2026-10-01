import { View, ActivityIndicator } from "react-native";

export default function Index() {
  // Routing is handled by RootNav in app/_layout.tsx
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
      <ActivityIndicator size="large" color="#E21B2D" />
    </View>
  );
}
