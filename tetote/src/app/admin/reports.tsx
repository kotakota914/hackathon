import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../../auth/AuthContext";
import { useFontSize } from "../../context/FontSizeContext";
import {
  STATUS_LABELS,
  TARGET_LABELS,
  listReports,
  reasonLabel,
  resolveReport,
  setUserSuspended,
  type Report,
  type ReportStatus,
} from "../../features/admin/reports";

const COLORS = { background: "#FFF5E9", green: "#245C2D", orange: "#F2A329", card: "#FFFFFF", text: "#111111", muted: "#555555", danger: "#B3261E" };

const FILTERS: { key: ReportStatus | null; label: string }[] = [
  { key: "open", label: "未対応" },
  { key: "investigating", label: "確認中" },
  { key: "resolved", label: "対応済み" },
  { key: null, label: "すべて" },
];

/**
 * 通報の確認（管理者）。通報を読み、対応済み／問題なしにする。
 * 通報された相手が利用者のときは、利用停止・解除もここから行う。
 */
export default function AdminReportsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const isAdmin = profile?.role === "admin";
  const [filter, setFilter] = useState<ReportStatus | null>("open");
  const [items, setItems] = useState<Report[]>([]);
  const [message, setMessage] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // 操作後の「〜しました」を消さないよう、読み込みでは message を触らない（失敗時だけ出す）。
  const load = useCallback(async (status: ReportStatus | null) => {
    try {
      setItems((await listReports(status)).items);
    } catch {
      setMessage("読み込めませんでした。時間をおいてもう一度お試しください。");
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      setMessage("");
      void load(filter);
    }, 0);
    return () => clearTimeout(timer);
  }, [filter, isAdmin, load]);

  const act = async (id: string, run: () => Promise<unknown>, done: string) => {
    if (busyId) return;
    setBusyId(id);
    setMessage("");
    try {
      await run();
      setMessage(done);
      await load(filter);
    } catch {
      setMessage("操作できませんでした。もう一度お試しください。");
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.screen}>
        <View style={[styles.container, styles.centered]}>
          <Ionicons name="lock-closed" size={40} color={COLORS.muted} />
          <Text style={[styles.title, { fontSize: fs(20), marginTop: 12 }]}>この画面は管理者だけが見られます</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/help" as never)} style={styles.link}>
            <Text style={[styles.linkText, { fontSize: fs(15) }]}>ホームへ戻る</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/admin/dashboard" as never)} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={COLORS.green} />
          <Text style={[styles.linkText, { fontSize: fs(15) }]}>ダッシュボード</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { fontSize: fs(12) }]}>運営 ・ 安全</Text>
        <Text style={[styles.title, { fontSize: fs(24) }]}>通報の確認</Text>

        <View style={styles.filters}>
          {FILTERS.map((option) => (
            <Pressable
              key={String(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === option.key }}
              onPress={() => setFilter(option.key)}
              style={({ pressed }) => [styles.chip, filter === option.key && styles.chipSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, filter === option.key && styles.chipTextSelected, { fontSize: fs(13) }]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        {message ? <Text accessibilityRole="alert" style={[styles.message, { fontSize: fs(13) }]}>{message}</Text> : null}
        {items.length === 0 && !message ? (
          <View style={styles.card}>
            <Text style={[styles.muted, { fontSize: fs(14) }]}>該当する通報はありません。</Text>
          </View>
        ) : null}

        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={[styles.badge, item.severity === "high" || item.severity === "critical" ? styles.badgeHigh : styles.badgeNormal, { fontSize: fs(12) }]}>
                {item.severity === "high" || item.severity === "critical" ? "重要" : "通常"} ・ {STATUS_LABELS[item.status]}
              </Text>
              <Text style={[styles.muted, { fontSize: fs(12) }]}>{item.createdAt.slice(0, 10)}</Text>
            </View>
            <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{reasonLabel(item.reason)}</Text>
            <Text style={[styles.muted, { fontSize: fs(12) }]}>
              対象: {TARGET_LABELS[item.targetType]} ・ {item.targetId}
            </Text>
            <Text style={[styles.body, { fontSize: fs(14), lineHeight: fs(22) }]}>{item.description}</Text>

            <View style={styles.actions}>
              {item.status === "open" || item.status === "investigating" ? (
                <>
                  <ActionButton label="対応済みにする" onPress={() => void act(item.id, () => resolveReport(item.id, "resolved"), "対応済みにしました")} disabled={busyId !== null} fs={fs} />
                  <ActionButton label="問題なし" onPress={() => void act(item.id, () => resolveReport(item.id, "rejected"), "問題なしとして閉じました")} disabled={busyId !== null} fs={fs} secondary />
                </>
              ) : null}
              {item.targetType === "user" ? (
                <>
                  <ActionButton label="利用停止" onPress={() => void act(item.id, () => setUserSuspended(item.targetId, true), "利用停止にしました")} disabled={busyId !== null} fs={fs} danger />
                  <ActionButton label="停止を解除" onPress={() => void act(item.id, () => setUserSuspended(item.targetId, false), "停止を解除しました")} disabled={busyId !== null} fs={fs} secondary />
                </>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function ActionButton({ label, onPress, disabled, fs, secondary, danger }: {
  label: string; onPress: () => void; disabled: boolean; fs: (n: number) => number; secondary?: boolean; danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, disabled && styles.buttonDisabled, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, { fontSize: fs(13) }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center" },
  container: { width: "100%", maxWidth: 720, padding: 20, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  link: { paddingVertical: 8 },
  linkText: { color: COLORS.green, fontWeight: "700" },
  eyebrow: { color: COLORS.orange, fontWeight: "800" },
  title: { color: COLORS.green, fontWeight: "900" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.green, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#FFFFFF" },
  chipSelected: { backgroundColor: COLORS.green },
  chipText: { color: COLORS.green, fontWeight: "700" },
  chipTextSelected: { color: "#FFFFFF" },
  message: { color: COLORS.green, fontWeight: "700" },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 6 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { fontWeight: "800", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  badgeHigh: { backgroundColor: "#FBE1DE", color: COLORS.danger },
  badgeNormal: { backgroundColor: "#EADFCF", color: COLORS.text },
  cardTitle: { color: COLORS.text, fontWeight: "800" },
  body: { color: COLORS.text },
  muted: { color: COLORS.muted },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  button: { borderRadius: 999, backgroundColor: COLORS.green, paddingHorizontal: 14, paddingVertical: 8 },
  buttonSecondary: { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: COLORS.green },
  buttonDanger: { backgroundColor: COLORS.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
  buttonTextSecondary: { color: COLORS.green },
  pressed: { opacity: 0.8 },
});
