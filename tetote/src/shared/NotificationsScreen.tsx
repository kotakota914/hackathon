import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFontSize } from "../context/FontSizeContext";
import {
  getNotifications,
  iconForKind,
  markNotificationsRead,
  relativeTime,
  urlForSide,
  type NotificationItem,
} from "../features/notifications/client";

const COLORS = { background: "#FFF5E9", green: "#245C2D", orange: "#F2A329", card: "#FFFFFF", text: "#111111", muted: "#555555" };

type State =
  | { status: "loading"; items: NotificationItem[] }
  | { status: "ready"; items: NotificationItem[] }
  | { status: "error"; items: NotificationItem[] };

/**
 * お知らせ一覧。開いた時点で全部を既読にする（バッジを消す）。
 * 1 件を押すと、その出来事の画面へ移る。
 */
export default function NotificationsScreen({ side }: { side: "help" | "helper" }) {
  const router = useRouter();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const [state, setState] = useState<State>({ status: "loading", items: [] });

  const load = useCallback(async () => {
    try {
      const list = await getNotifications();
      setState({ status: "ready", items: list.items });
      if (list.unreadCount > 0) {
        // 開いた時点で既読にする。失敗しても一覧は見せる。
        await markNotificationsRead(null).catch(() => undefined);
      }
    } catch {
      setState((current) => ({ status: "error", items: current.items }));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/${side}` as never);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={COLORS.green} />
            <Text style={[styles.backText, { fontSize: fs(15) }]}>戻る</Text>
          </Pressable>
          <Text style={[styles.title, { fontSize: fs(22) }]}>お知らせ</Text>
        </View>

        {state.status === "loading" ? (
          <Text style={[styles.muted, { fontSize: fs(14) }]}>読み込んでいます…</Text>
        ) : null}
        {state.status === "error" ? (
          <Pressable accessibilityRole="button" onPress={() => void load()}>
            <Text accessibilityRole="alert" style={[styles.error, { fontSize: fs(14) }]}>
              読み込めませんでした。押してもう一度試す
            </Text>
          </Pressable>
        ) : null}
        {state.status === "ready" && state.items.length === 0 ? (
          <View style={styles.card}>
            <Text style={[styles.muted, { fontSize: fs(14), lineHeight: fs(22) }]}>
              まだお知らせはありません。応募が届いたり、メッセージが来たりするとここに並びます。
            </Text>
          </View>
        ) : null}

        {state.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => router.push(urlForSide(item.url, side) as never)}
            style={({ pressed }) => [styles.card, styles.row, !item.readAt && styles.unread, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, !item.readAt && styles.iconWrapUnread]}>
              <Ionicons name={iconForKind(item.kind)} size={22} color={item.readAt ? COLORS.muted : "#FFFFFF"} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { fontSize: fs(15) }]}>{item.title}</Text>
              <Text style={[styles.rowBody, { fontSize: fs(13), lineHeight: fs(20) }]}>{item.body}</Text>
              <Text style={[styles.muted, { fontSize: fs(11) }]}>{relativeTime(item.createdAt)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center" },
  container: { width: "100%", maxWidth: 520, padding: 16, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  back: { flexDirection: "row", alignItems: "center" },
  backText: { color: COLORS.green, fontWeight: "700" },
  title: { color: COLORS.green, fontWeight: "900" },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  unread: { borderWidth: 2, borderColor: COLORS.orange },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EADFCF", alignItems: "center", justifyContent: "center" },
  iconWrapUnread: { backgroundColor: COLORS.orange },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: COLORS.text, fontWeight: "800" },
  rowBody: { color: COLORS.text },
  muted: { color: COLORS.muted },
  error: { color: "#B3261E", fontWeight: "700" },
  pressed: { opacity: 0.8 },
});
