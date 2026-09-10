import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { browserAuthClient } from "../../auth/client";
import { useFontSize } from "../../context/FontSizeContext";
import { RESET_MAIL_SENT_MESSAGE, validateEmail } from "../../features/auth/password-reset";

const COLORS = { background: "#FFF5E9", green: "#245C2D", text: "#111111", muted: "#555555", danger: "#B3261E" };

/**
 * パスワードをお忘れですか。メールアドレスを入れると再設定の案内メールが届く。
 * 登録の有無にかかわらず同じ案内を出す（メールアドレスの存在を推測させない）。
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    const result = await browserAuthClient.requestPasswordReset(email.trim());
    setBusy(false);
    if (result.ok) setSent(true);
    else setError(result.message);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/login")} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={COLORS.green} />
          <Text style={[styles.backText, { fontSize: fs(15) }]}>ログインへ戻る</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { fontSize: fs(24) }]}>パスワードをお忘れですか</Text>

        {sent ? (
          <View style={styles.card}>
            <Ionicons name="mail-open-outline" size={36} color={COLORS.green} />
            <Text style={[styles.body, { fontSize: fs(15), lineHeight: fs(24) }]}>{RESET_MAIL_SENT_MESSAGE}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/login")} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={[styles.buttonText, { fontSize: fs(16) }]}>ログインへ戻る</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={[styles.body, { fontSize: fs(14), lineHeight: fs(22) }]}>
              登録したメールアドレスを入力してください。パスワードを作り直すための案内をメールで送ります。
            </Text>
            <Text style={[styles.label, { fontSize: fs(13) }]}>メールアドレス</Text>
            <TextInput
              accessibilityLabel="メールアドレス"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="example@email.com"
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
              <Text style={[styles.buttonText, { fontSize: fs(16) }]}>{busy ? "送信中…" : "案内メールを送る"}</Text>
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
