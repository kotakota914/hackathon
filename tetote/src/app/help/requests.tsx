import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  formatScheduledAt,
  listMyRequests,
  requestListErrorMessage,
  requestStatusLabel,
  type PublicRequest,
} from "../../features/requests/client";
import { canCancelRequest, canEditRequest } from "../../features/requests/edit";
import { listApplicants, selectApplicant, selectionErrorMessage, type Applicant } from "../../features/applications/client";

/**
 * 自分の依頼一覧（依頼者向け）。
 * 一覧 → 1 件を開くと内容・応募者が見え、編集や取消は専用画面（request-edit）へ進む。
 */

const CLOSED_STATUSES = new Set(["cancelled", "expired", "rejected", "completed"]);

export default function MyRequestsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PublicRequest[]>([]);
  const [selected, setSelected] = useState<PublicRequest | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  // 公開一覧ではなく本人の依頼一覧を使う。審査待ち・マッチ済み・完了・取消済みも並ぶ。
  const load = useCallback(async () => {
    setStatus("loading"); setMessage("");
    try {
      const page = await listMyRequests();
      setItems(page.items);
      setStatus("ready");
    } catch (error) { setMessage(requestListErrorMessage(error)); setStatus("error"); }
  }, []);

  useEffect(() => {
    let active = true;
    void listMyRequests().then((page) => {
      if (!active) return;
      setItems(page.items);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(requestListErrorMessage(error));
      setStatus("error");
    });
    return () => { active = false; };
  }, []);

  const open = async (request: PublicRequest) => {
    setSelected(request); setMessage(""); setApplicants([]);
    const state = await listApplicants(request.id);
    if (state.status === "ready") setApplicants(state.items);
    else if (state.status === "empty") setApplicants([]);
    else setMessage("応募者一覧を取得できませんでした。");
  };

  const choose = async (applicant: Applicant) => {
    if (!selected) return;
    try {
      const match = await selectApplicant(applicant.id, selected.version ?? 1);
      router.push({ pathname: "/help/chat", params: { matchId: match.id } });
    } catch (error) { setMessage(selectionErrorMessage(error)); }
  };

  const badgeStyle = (requestStatus: string) =>
    requestStatus === "published" || requestStatus === "matching"
      ? styles.badgeOpen
      : CLOSED_STATUSES.has(requestStatus) ? styles.badgeMuted : styles.badgeActive;

  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.container}>
    <Pressable accessibilityRole="button" onPress={() => (selected ? setSelected(null) : router.back())}>
      <Text style={styles.link}>{selected ? "一覧へ" : "戻る"}</Text>
    </Pressable>
    <Text style={styles.heading}>{selected ? "依頼の内容" : "自分の依頼"}</Text>
    {status === "loading" ? <ActivityIndicator color="#245C2D" /> : null}
    {status === "error" ? <Pressable onPress={() => void load()}><Text style={styles.link}>{message} 再試行</Text></Pressable> : null}
    {!selected && status === "ready" && items.length === 0 ? <Text style={styles.body}>依頼はまだありません。</Text> : null}
    {!selected ? items.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => void open(item)} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={[styles.badge, badgeStyle(item.status)]}>{requestStatusLabel(item.status)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={16} color="#5C6B4A" />
        <Text style={styles.meta}>{formatScheduledAt(item.scheduledAt)}</Text>
        <Ionicons name="location-outline" size={16} color="#5C6B4A" />
        <Text style={styles.meta}>{item.areaLabel}</Text>
      </View>
    </Pressable>) : <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{selected.title}</Text>
        <Text style={[styles.badge, badgeStyle(selected.status)]}>{requestStatusLabel(selected.status)}</Text>
      </View>
      <Text style={styles.body}>{selected.description}</Text>
      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={16} color="#5C6B4A" />
        <Text style={styles.meta}>{formatScheduledAt(selected.scheduledAt)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={16} color="#5C6B4A" />
        <Text style={styles.meta}>{selected.areaLabel}</Text>
        <Ionicons name="time-outline" size={16} color="#5C6B4A" />
        <Text style={styles.meta}>約{selected.estimatedMinutes}分</Text>
        <Ionicons name="people-outline" size={16} color="#5C6B4A" />
        <Text style={styles.meta}>{selected.requiredHelpers}人募集（{selected.acceptedHelpers}人決定）</Text>
      </View>
      {canEditRequest(selected.status) || canCancelRequest(selected.status) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/help/request-edit", params: { requestId: selected.id } })}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>
            {canEditRequest(selected.status) ? "内容を編集する・取り消す" : "依頼を取り消す"}
          </Text>
        </Pressable>
      ) : null}
      <Text style={styles.subheading}>応募者</Text>
      {applicants.length === 0 ? <Text style={styles.body}>応募者はまだいません。</Text> : applicants.map((applicant) => <View key={applicant.id} style={styles.applicant}>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: "/users/[userId]", params: { userId: applicant.helper.id } })}
        >
          <Text style={[styles.title, styles.link]}>{applicant.helper.displayName} ›</Text>
        </Pressable>
        <Text style={styles.body}>{applicant.message}</Text><Text style={styles.meta}>実績 {applicant.helper.achievementCount}件</Text>
        <Pressable accessibilityRole="button" onPress={() => void choose(applicant)} style={styles.primary}><Text style={styles.primaryText}>この人にお願いする</Text></Pressable>
      </View>)}
    </View>}
    {message && status !== "error" ? <Text style={styles.message}>{message}</Text> : null}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", backgroundColor: "#FFF5E9" },
  container: { width: "100%", maxWidth: 520, padding: 28, gap: 14 },
  heading: { fontSize: 28, fontWeight: "900", color: "#35410F" },
  subheading: { fontSize: 20, fontWeight: "800", marginTop: 18 },
  card: { padding: 18, borderRadius: 14, backgroundColor: "#FFFFFF", gap: 10 },
  applicant: { paddingTop: 14, borderTopWidth: 1, borderTopColor: "#DDDDDD", gap: 6 },
  title: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  body: { fontSize: 15, color: "#3C4535", lineHeight: 22 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  meta: { fontSize: 13, color: "#5C6B4A", fontWeight: "700", marginRight: 6 },
  badge: { fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, color: "#FFFFFF" },
  badgeOpen: { backgroundColor: "#159326" },
  badgeActive: { backgroundColor: "#D89B31" },
  badgeMuted: { backgroundColor: "#9E9E9E" },
  primary: { alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: "#245C2D" },
  primaryText: { color: "#FFFFFF", fontWeight: "700" },
  link: { color: "#245C2D", fontWeight: "700", paddingVertical: 8 },
  message: { color: "#A23B32" },
});
