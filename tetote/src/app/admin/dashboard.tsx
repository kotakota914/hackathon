import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../../auth/AuthContext";
import { useFontSize } from "../../context/FontSizeContext";
import {
  completionRate,
  formatCount,
  getMunicipalityOverview,
  overviewToCsv,
  rangeForDays,
  type BreakdownItem,
  type MunicipalityOverview,
} from "../../features/dashboard/client";

const COLORS = {
  background: "#FFF5E9",
  green: "#245C2D",
  orange: "#F2A329",
  card: "#FFFFFF",
  text: "#111111",
  muted: "#555555",
  danger: "#B3261E",
  track: "#EADFCF",
};

const PRESETS = [
  { label: "直近 30 日", days: 30 },
  { label: "直近 90 日", days: 90 },
  { label: "直近 1 年", days: 365 },
] as const;

/**
 * 自治体ダッシュボード（段階1: 管理者が全地域の集計を見る）。
 * 個人情報は一切出さず、件数と割合だけを示す。人数が少ない区分は「-」で伏せる。
 * PC での閲覧を想定し、CSV でも書き出せる。
 */
export default function MunicipalityDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const [days, setDays] = useState<number>(90);
  const [overview, setOverview] = useState<MunicipalityOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isAdmin = profile?.role === "admin";

  const load = useCallback(async (period: number) => {
    setLoading(true);
    setError("");
    try {
      setOverview(await getMunicipalityOverview(rangeForDays(period)));
    } catch {
      setError("集計を取得できませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // 描画中に state を更新しないよう、次のティックで取得を始める。
    const timer = setTimeout(() => void load(days), 0);
    return () => clearTimeout(timer);
  }, [days, isAdmin, load]);

  const downloadCsv = () => {
    if (!overview || Platform.OS !== "web") return;
    const blob = new Blob([overviewToCsv(overview)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fitt0-dashboard-${overview.toDate.slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <View style={styles.screen}>
        <View style={[styles.container, styles.centered]}>
          <Ionicons name="lock-closed" size={40} color={COLORS.muted} />
          <Text style={[styles.title, { fontSize: fs(20), marginTop: 12 }]}>この画面は管理者だけが見られます</Text>
          <Text style={[styles.muted, { fontSize: fs(14), textAlign: "center" }]}>
            自治体向けの集計画面です。運営の管理者アカウントでログインしてください。
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/help" as never)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryButtonText, { fontSize: fs(15) }]}>ホームへ戻る</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const t = overview?.totals;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { fontSize: fs(12) }]}>自治体向け ・ 地域の助け合い状況</Text>
            <Text style={[styles.title, { fontSize: fs(24) }]}>ダッシュボード</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/admin/reports" as never)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Ionicons name="shield-outline" size={18} color={COLORS.green} />
            <Text style={[styles.secondaryButtonText, { fontSize: fs(14) }]}>通報の確認</Text>
          </Pressable>
          {Platform.OS === "web" && overview ? (
            <Pressable
              accessibilityRole="button"
              onPress={downloadCsv}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="download-outline" size={18} color={COLORS.green} />
              <Text style={[styles.secondaryButtonText, { fontSize: fs(14) }]}>CSV で保存</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.days}
              accessibilityRole="button"
              accessibilityState={{ selected: days === preset.days }}
              onPress={() => setDays(preset.days)}
              style={({ pressed }) => [
                styles.preset,
                days === preset.days && styles.presetSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.presetText, days === preset.days && styles.presetTextSelected, { fontSize: fs(14) }]}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { fontSize: fs(14) }]}>{error}</Text>
        ) : null}
        {loading && !overview ? (
          <Text style={[styles.muted, { fontSize: fs(14) }]}>集計しています…</Text>
        ) : null}

        {overview && t ? (
          <>
            <Text style={[styles.period, { fontSize: fs(13) }]}>
              集計期間: {formatDate(overview.fromDate)} 〜 {formatDate(overview.toDate)}
              {loading ? " （更新中…）" : ""}
            </Text>

            <View style={styles.metrics}>
              <Metric label="依頼数" value={String(t.requestsCreated)} fs={fs} />
              <Metric label="完了した依頼" value={String(t.requestsCompleted)} sub={completionRate(t.requestsCreated, t.requestsCompleted)} fs={fs} />
              <Metric label="成立したマッチ" value={String(t.matchesFormed)} fs={fs} />
              <Metric label="支援した人数" value={formatCount(t.activeHelpers)} fs={fs} />
              <Metric label="平均所要時間" value={t.avgEstimatedMinutes === null ? "-" : `${t.avgEstimatedMinutes}分`} fs={fs} />
              <Metric label="取消・期限切れ" value={String(t.requestsCancelled)} fs={fs} />
            </View>

            <Breakdown title="地域別" rows={overview.byArea} fs={fs} />
            <Breakdown title="カテゴリ別" rows={overview.byCategory} fs={fs} />

            <Text style={[styles.note, { fontSize: fs(12), lineHeight: fs(18) }]}>
              個人を特定できる情報は含みません。件数が {overview.minCellSize} 未満の区分は、少人数から個人が推測されないよう「-」で伏せています。
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, sub, fs }: { label: string; value: string; sub?: string; fs: (n: number) => number }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { fontSize: fs(12) }]}>{label}</Text>
      <Text style={[styles.metricValue, { fontSize: fs(26) }]}>{value}</Text>
      {sub ? <Text style={[styles.metricSub, { fontSize: fs(12) }]}>完了率 {sub}</Text> : null}
    </View>
  );
}

function Breakdown({ title, rows, fs }: { title: string; rows: BreakdownItem[]; fs: (n: number) => number }) {
  const max = Math.max(1, ...rows.map((row) => row.requests ?? 0));
  return (
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[styles.muted, { fontSize: fs(13) }]}>この期間の依頼はありません。</Text>
      ) : null}
      {rows.map((row) => {
        const width = row.requests === null ? 0 : Math.round((row.requests / max) * 100);
        return (
          <View key={row.key} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={[styles.rowLabel, { fontSize: fs(14) }]}>{row.label}</Text>
              <Text style={[styles.rowValue, { fontSize: fs(13) }]}>
                {formatCount(row.requests)} 件 ・ 完了 {formatCount(row.completed)} ・ {completionRate(row.requests, row.completed)}
              </Text>
            </View>
            <View style={styles.track} accessibilityRole="progressbar">
              <View style={[styles.fill, { width: `${width}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center" },
  container: { width: "100%", maxWidth: 900, padding: 24, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  header: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  eyebrow: { color: COLORS.orange, fontWeight: "800" },
  title: { color: COLORS.green, fontWeight: "900" },
  muted: { color: COLORS.muted },
  period: { color: COLORS.muted },
  note: { color: COLORS.muted },
  error: { color: COLORS.danger, fontWeight: "700" },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: {
    borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.green,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#FFFFFF",
  },
  presetSelected: { backgroundColor: COLORS.green },
  presetText: { color: COLORS.green, fontWeight: "700" },
  presetTextSelected: { color: "#FFFFFF" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: {
    flexGrow: 1, flexBasis: 160, backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 4,
  },
  metricLabel: { color: COLORS.muted, fontWeight: "700" },
  metricValue: { color: COLORS.green, fontWeight: "900" },
  metricSub: { color: COLORS.orange, fontWeight: "700" },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 18, gap: 12 },
  cardTitle: { color: COLORS.green, fontWeight: "800" },
  row: { gap: 6 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  rowLabel: { color: COLORS.text, fontWeight: "700" },
  rowValue: { color: COLORS.muted },
  track: { height: 10, borderRadius: 5, backgroundColor: COLORS.track, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: COLORS.orange },
  secondaryButton: {
    flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1.5,
    borderColor: COLORS.green, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: { color: COLORS.green, fontWeight: "800" },
  pressed: { opacity: 0.8 },
});
