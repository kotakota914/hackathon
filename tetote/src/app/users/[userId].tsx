import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ApiError } from "../../api/errors";
import { useFontSize } from "../../context/FontSizeContext";
import {
  REVIEW_TRAIT_LABELS,
  VERIFICATION_LABELS,
  getPublicProfile,
  memberSinceLabel,
  minutesLabel,
  type PublicProfile,
} from "../../features/profiles/client";

const COLORS = {
  background: "#FFF5E9",
  green: "#245C2D",
  orange: "#F2A329",
  card: "#FFFFFF",
  text: "#111111",
  muted: "#555555",
};

// 段階ごとの画像。require はビルド時に解決されるため、動的なパスは使えない。
const characterImages: Record<string, number> = {
  c1: require("../../../assets/onboarding_asset/c1.png"),
  c2: require("../../../assets/onboarding_asset/c2.png"),
  c3: require("../../../assets/onboarding_asset/c3.png"),
};

type State =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "missing" }
  | { status: "error" };

/**
 * 他の利用者の公開プロフィール（実績ページ）。
 * 依頼者が「この人にお願いするか」を決める材料として、本人確認・支援回数・
 * 合計時間・キャラクター・本人が公開した実績文だけを見せる。
 */
export default function PublicProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const timer = setTimeout(() => {
      void getPublicProfile(userId)
        .then((profile) => {
          if (active) setState({ status: "ready", profile });
        })
        .catch((error) => {
          if (!active) return;
          setState(error instanceof ApiError && error.status === 404 ? { status: "missing" } : { status: "error" });
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/help" as never);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={COLORS.green} />
          <Text style={[styles.backText, { fontSize: fs(15) }]}>戻る</Text>
        </Pressable>

        {state.status === "loading" ? (
          <Text style={[styles.muted, { fontSize: fs(14) }]}>読み込んでいます…</Text>
        ) : null}
        {state.status === "missing" ? (
          <View style={styles.card}>
            <Text style={[styles.title, { fontSize: fs(18) }]}>この利用者は表示できません</Text>
            <Text style={[styles.muted, { fontSize: fs(14), lineHeight: fs(22) }]}>
              退会した、またはブロック関係にある利用者のページは表示されません。
            </Text>
          </View>
        ) : null}
        {state.status === "error" ? (
          <Text accessibilityRole="alert" style={[styles.error, { fontSize: fs(14) }]}>
            読み込めませんでした。時間をおいてもう一度お試しください。
          </Text>
        ) : null}

        {state.status === "ready" ? <ProfileBody profile={state.profile} fs={fs} /> : null}
      </ScrollView>
    </View>
  );
}

function ProfileBody({ profile, fs }: { profile: PublicProfile; fs: (n: number) => number }) {
  const verified = profile.verificationStatus === "approved";
  const image = characterImages[profile.character.characterId] ?? characterImages.c1;
  return (
    <>
      <View style={styles.hero}>
        <Image source={image} style={styles.character} resizeMode="contain" />
        <Text style={[styles.name, { fontSize: fs(24) }]}>{profile.displayName}</Text>
        <View style={[styles.badge, verified ? styles.badgeVerified : styles.badgeMuted]}>
          <Ionicons
            name={verified ? "shield-checkmark" : "shield-outline"}
            size={16}
            color={verified ? "#FFFFFF" : COLORS.muted}
          />
          <Text style={[styles.badgeText, verified ? styles.badgeTextVerified : styles.badgeTextMuted, { fontSize: fs(13) }]}>
            {VERIFICATION_LABELS[profile.verificationStatus]}
          </Text>
        </View>
        {profile.memberSince ? (
          <Text style={[styles.muted, { fontSize: fs(13) }]}>{memberSinceLabel(profile.memberSince)}参加</Text>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat label="お手伝い回数" value={`${profile.completedCount}回`} fs={fs} />
        <Stat label="活動時間の合計" value={minutesLabel(profile.totalMinutes)} fs={fs} />
        <Stat label="キャラクター" value={`${profile.character.stage} / ${profile.character.maxStage} 段階`} fs={fs} />
      </View>

      <View style={styles.card}>
        <Text style={[styles.title, { fontSize: fs(16) }]}>受け取った評価</Text>
        {profile.reviewSummary.count === 0 ? (
          <Text style={[styles.muted, { fontSize: fs(14), lineHeight: fs(22) }]}>まだ評価はありません。</Text>
        ) : (
          <>
            <Text style={[styles.body, { fontSize: fs(14) }]}>{profile.reviewSummary.count}件の評価</Text>
            {REVIEW_TRAIT_LABELS.map(({ key, label }) => (
              <View key={key} style={styles.traitRow}>
                <Text style={[styles.body, { fontSize: fs(14) }]}>{label}</Text>
                <Text style={[styles.traitValue, { fontSize: fs(14) }]}>
                  {profile.reviewSummary[key]} / {profile.reviewSummary.count}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={[styles.title, { fontSize: fs(16) }]}>実績</Text>
        {profile.achievementText ? (
          <Text style={[styles.body, { fontSize: fs(15), lineHeight: fs(24) }]}>{profile.achievementText}</Text>
        ) : (
          <Text style={[styles.muted, { fontSize: fs(14), lineHeight: fs(22) }]}>
            公開されている実績文はまだありません。お手伝いの回数と本人確認の状態を参考にしてください。
          </Text>
        )}
      </View>

      <Text style={[styles.note, { fontSize: fs(12), lineHeight: fs(18) }]}>
        このページには住んでいる地域や年齢などの個人情報は表示されません。
      </Text>
    </>
  );
}

function Stat({ label, value, fs }: { label: string; value: string; fs: (n: number) => number }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { fontSize: fs(20) }]}>{value}</Text>
      <Text style={[styles.statLabel, { fontSize: fs(12) }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background, alignItems: "center" },
  container: { width: "100%", maxWidth: 520, padding: 20, gap: 16 },
  back: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: COLORS.green, fontWeight: "700" },
  hero: { alignItems: "center", gap: 8 },
  character: { width: 120, height: 120 },
  name: { color: COLORS.green, fontWeight: "900" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeVerified: { backgroundColor: COLORS.green },
  badgeMuted: { backgroundColor: "#EADFCF" },
  badgeText: { fontWeight: "800" },
  badgeTextVerified: { color: "#FFFFFF" },
  badgeTextMuted: { color: COLORS.muted },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 12, alignItems: "center", gap: 4 },
  statValue: { color: COLORS.green, fontWeight: "900", textAlign: "center" },
  statLabel: { color: COLORS.muted, textAlign: "center" },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 18, gap: 10 },
  title: { color: COLORS.green, fontWeight: "800" },
  body: { color: COLORS.text },
  traitRow: { flexDirection: "row", justifyContent: "space-between" },
  traitValue: { color: COLORS.green, fontWeight: "800" },
  muted: { color: COLORS.muted },
  note: { color: COLORS.muted, textAlign: "center" },
  error: { color: "#B3261E", fontWeight: "700" },
});
