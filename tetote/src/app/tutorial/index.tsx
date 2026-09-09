import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { useFontSize } from "../../context/FontSizeContext";
import { hasCompletedTutorial } from "../../features/tutorial/storage";
import { TUTORIAL_COLORS } from "../../shared/tutorial/TutorialUi";

/**
 * 練習モードの入口。どちらの立場を体験するか選ぶ。
 * `next` に戻り先のパスを渡すと、終えたあとそこへ戻る（無ければトップへ）。
 */
export default function TutorialMenuScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  const returnTo = typeof next === "string" && next.startsWith("/") ? next : "/auth";

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={[styles.title, { fontSize: fs(26) }]}>使い方を体験する</Text>
        <Text style={[styles.subtitle, { fontSize: fs(15), lineHeight: fs(24) }]}>
          本物そっくりの画面で、一通りの流れを自分の指で試せます。{"\n"}
          相手は練習用の人で、本当の依頼は作られません。所要 2 分ほどです。
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/tutorial/requester", params: { next: returnTo } })}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <Image
            source={require("../../../assets/onboarding_asset/c1.png")}
            style={styles.cardImage}
            resizeMode="contain"
          />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { fontSize: fs(18) }]}>手伝ってほしい人の流れ</Text>
            <Text style={[styles.cardBody, { fontSize: fs(13), lineHeight: fs(20) }]}>
              依頼を書く → 応募が届く → 相手を選ぶ → やり取り → 完了
            </Text>
            {hasCompletedTutorial("requester") ? (
              <Text style={[styles.done, { fontSize: fs(12) }]}>体験済み ・ もう一度できます</Text>
            ) : null}
          </View>
        </Pressable>

        <View style={[styles.card, styles.cardDisabled]} accessibilityState={{ disabled: true }}>
          <Image
            source={require("../../../assets/onboarding_asset/c2.png")}
            style={styles.cardImage}
            resizeMode="contain"
          />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { fontSize: fs(18) }]}>手伝いたい人の流れ</Text>
            <Text style={[styles.cardBody, { fontSize: fs(13), lineHeight: fs(20) }]}>
              近くの依頼を見る → 応募する → 選ばれる → やり取り → 完了報告
            </Text>
            <Text style={[styles.done, { fontSize: fs(12) }]}>準備中</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace(returnTo as never)}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        >
          <Text style={[styles.skipText, { fontSize: fs(15) }]}>今はやらない</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TUTORIAL_COLORS.background,
    alignItems: "center",
  },
  container: {
    width: "100%",
    maxWidth: 520,
    padding: 24,
    gap: 16,
  },
  title: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "900",
    marginTop: 24,
  },
  subtitle: {
    color: TUTORIAL_COLORS.muted,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: TUTORIAL_COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: TUTORIAL_COLORS.orange,
  },
  cardDisabled: {
    opacity: 0.55,
    borderColor: "#DDDDDD",
  },
  cardImage: {
    width: 64,
    height: 64,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "800",
  },
  cardBody: {
    color: TUTORIAL_COLORS.text,
  },
  done: {
    color: TUTORIAL_COLORS.orange,
    fontWeight: "700",
  },
  skip: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  skipText: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  pressed: {
    opacity: 0.8,
  },
});
