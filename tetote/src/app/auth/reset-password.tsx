import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { browserAuthClient } from "../../auth/client";
import { useFontSize } from "../../context/FontSizeContext";
import {
  RESET_DONE_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
  validateNewPassword,
} from "../../features/auth/password-reset";

const COLORS = { background: "#FFF5E9", green: "#245C2D", text: "#111111", muted: "#555555", danger: "#B3261E" };

/**
 * メールの案内から開く、新しいパスワードを決める画面。
 * URL の token は SuperTokens の SDK が自動で読む。無ければ期限切れとして案内する。
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasToken = typeof token === "string" && token.length > 0;

  const submit = async () => {
    if (busy) return;
    const problem = validateNewPassword(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    const result = await browserAuthClient.submitNewPassword(password);
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(result.message);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/login")} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={COLORS.green} />
          <Text style={[styles.backText, { fontSize: fs(15) }]}>ログインへ戻る</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { fontSize: fs(24) }]}>新しいパスワードを決める</Text>

        {!hasToken ? (
          <View style={styles.card}>
            <Text style={[styles.body, { fontSize: fs(15), lineHeight: fs(24) }]}>{RESET_LINK_INVALID_MESSAGE}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/forgot-password" as never)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, { fontSize: fs(16) }]}>やり直す</Text>
            </Pressable>
          </View>
        ) : done ? (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={36} color={COLORS.green} />
            <Text style={[styles.body, { fontSize: fs(15), lineHeight: fs(24) }]}>{RESET_DONE_MESSAGE}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, { fontSize: fs(16) }]}>ログインする</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={[styles.label, { fontSize: fs(13) }]}>新しいパスワード（8文字以上）</Text>
            <TextInput
              accessibilityLabel="新しいパスワード"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="新しいパスワード"
              placeholderTextColor="#AAAAAA"
              style={[styles.input, { fontSize: fs(16) }]}
            />
            <Text style={[styles.label, { fontSize: fs(13) }]}>もう一度入力</Text>
            <TextInput
              accessibilityLabel="新しいパスワード（確認）"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoCapitalize="none"
              placeholder="もう一度入力"
              placeholderTextColor="#AAAAAA"
              style={[styles.input, { fontSize: fs(16) }]}
            />
            {error ? <Text accessibilityRole="alert" style={[styles.error, { fontSize: fs(13) }]}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.button, busy && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, { fontSize: fs(16) }]}>{busy ? "変更中…" : "パスワードを変更する"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center" },
  container: { width: "100%", maxWidth: 520, padding: 24, gap: 16 },
  back: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: COLORS.green, fontWeight: "700" },
  title: { color: COLORS.green, fontWeight: "900" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, gap: 12, alignItems: "stretch" },
  body: { color: COLORS.text },
  label: { color: COLORS.muted, fontWeight: "700" },
  input: { borderWidth: 1.5, borderColor: "#DDD5C8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, backgroundColor: "#FFFDF9" },
  error: { color: COLORS.danger, fontWeight: "700" },
  button: { borderRadius: 999, backgroundColor: COLORS.green, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
