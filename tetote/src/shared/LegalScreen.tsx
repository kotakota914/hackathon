import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFontSize } from "../context/FontSizeContext";
import { LEGAL_DOCUMENTS, type LegalKey } from "../features/legal/content";

const COLORS = { background: "#FFF5E9", green: "#245C2D", card: "#FFFFFF", text: "#111111", muted: "#555555" };

/** 利用規約・プライバシーポリシー・ヘルプを表示する。ログイン前でも開ける。 */
export default function LegalScreen({ document: key }: { document: LegalKey }) {
  const router = useRouter();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const doc = LEGAL_DOCUMENTS[key];

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/auth" as never);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={COLORS.green} />
          <Text style={[styles.backText, { fontSize: fs(15) }]}>戻る</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { fontSize: fs(24) }]}>{doc.title}</Text>
        <Text style={[styles.muted, { fontSize: fs(12) }]}>最終更新: {doc.updatedAt}</Text>
        {doc.intro ? <Text style={[styles.body, { fontSize: fs(14), lineHeight: fs(23) }]}>{doc.intro}</Text> : null}

        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.card}>
            <Text accessibilityRole="header" style={[styles.heading, { fontSize: fs(16) }]}>{section.heading}</Text>
            {section.body.map((line, index) => (
              <Text key={`${section.heading}-${index}`} style={[styles.body, { fontSize: fs(14), lineHeight: fs(23) }]}>
                {section.body.length > 1 ? "・ " : ""}
                {line}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center" },
  container: { width: "100%", maxWidth: 640, padding: 20, gap: 12 },
  back: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: COLORS.green, fontWeight: "700" },
  title: { color: COLORS.green, fontWeight: "900" },
  muted: { color: COLORS.muted },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 8 },
  heading: { color: COLORS.green, fontWeight: "800" },
  body: { color: COLORS.text },
});
