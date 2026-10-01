import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { Button, AppIcon, useAccent } from "@/src/components/ui";

// Speech-to-text is provider-agnostic:
//  - Web: browser SpeechRecognition (device-native, free).
//  - Native: the OS keyboard microphone (tap the field, use the mic key).
// The transcript is always editable and returned via onSave — a future
// Whisper/Gemini provider can be plugged in without changing callers.
function getRecognition(): any {
  if (Platform.OS !== "web") return null;
  const w: any = typeof window !== "undefined" ? window : null;
  const R = w?.SpeechRecognition || w?.webkitSpeechRecognition;
  return R ? new R() : null;
}

export function VoiceCapture({
  visible,
  title = "Dicter une note",
  initial = "",
  onClose,
  onSave,
}: {
  visible: boolean;
  title?: string;
  initial?: string;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors } = useTheme();
  const accent = useAccent();
  const [text, setText] = useState(initial);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const webSupported = Platform.OS === "web" && !!getRecognition();

  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  const toggleListen = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    let base = text ? text + " " : "";
    rec.onresult = (e: any) => {
      let s2 = "";
      for (let i = e.resultIndex; i < e.results.length; i++) s2 += e.results[i][0].transcript;
      setText((base + s2).trim());
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="voice-close">
              <AppIcon name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <Pressable
              onPress={toggleListen}
              disabled={!webSupported}
              style={[s.mic, { backgroundColor: listening ? colors.error : accent, opacity: webSupported ? 1 : 0.4 }]}
              testID="voice-mic"
            >
              <AppIcon name={listening ? "stop" : "microphone"} size={38} color="#FFFFFF" />
            </Pressable>
            <Text style={s.hint}>
              {webSupported
                ? listening
                  ? "Parlez… appuyez pour arrêter"
                  : "Appuyez pour dicter"
                : "Saisissez, ou utilisez le micro de votre clavier"}
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={s.input}
              value={text}
              onChangeText={setText}
              placeholder="Votre note apparaîtra ici…"
              placeholderTextColor={colors.muted}
              multiline
              autoFocus={Platform.OS !== "web"}
              testID="voice-text"
            />
          </ScrollView>

          <Button
            label="Ajouter à l'intervention"
            onPress={() => {
              recRef.current?.stop?.();
              onSave(text.trim());
            }}
            disabled={!text.trim()}
            testID="voice-save"
            style={{ marginTop: 12 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  mic: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  hint: { fontSize: 13, color: c.muted, textAlign: "center" },
  input: { backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 14, fontSize: 16, color: c.onSurface, minHeight: 90, textAlignVertical: "top", borderWidth: 1, borderColor: c.border },
}));
