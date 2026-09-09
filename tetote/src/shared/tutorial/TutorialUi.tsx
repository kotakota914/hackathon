import { useEffect, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useFontSize } from "../../context/FontSizeContext";
import type { Coach } from "../../features/tutorial/requester";

export const TUTORIAL_COLORS = {
  background: "#FFF5E9",
  green: "#245C2D",
  orange: "#F2A329",
  card: "#FFFFFF",
  text: "#111111",
  muted: "#555555",
  danger: "#B3261E",
};

/**
 * 練習モードの枠。上に「練習モード」の帯と「やめる」、その下に案内、残りが画面本体。
 * 本番の画面と見分けがつくように、帯は常に出す。
 */
export function TutorialFrame({
  coach,
  onQuit,
  children,
}: {
  coach: Coach;
  onQuit: () => void;
  children: ReactNode;
}) {
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.banner}>
          <Text style={[styles.bannerText, { fontSize: fs(13) }]}>
            練習モード ・ 本当の依頼は作られません
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onQuit}
            hitSlop={8}
            style={({ pressed }) => [styles.quitButton, pressed && styles.pressed]}
          >
            <Text style={[styles.quitText, { fontSize: fs(13) }]}>やめる</Text>
          </Pressable>
        </View>
        <CoachBubble coach={coach} />
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

/** 「いま何をすればよいか」を一文で示す案内。段階が変わると内容が入れ替わる。 */
export function CoachBubble({ coach }: { coach: Coach }) {
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;
  return (
    <View
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      style={styles.coach}
    >
      <Text style={[styles.coachStep, { fontSize: fs(12) }]}>
        {coach.step} / {coach.total}
      </Text>
      <Text style={[styles.coachTitle, { fontSize: fs(18) }]}>{coach.title}</Text>
      <Text style={[styles.coachBody, { fontSize: fs(14), lineHeight: fs(22) }]}>
        {coach.body}
      </Text>
    </View>
  );
}

/**
 * 「次に押すボタン」を、ふちがゆっくり明滅する枠で目立たせる。
 * 押せない状態（active=false）では光らせない。
 */
export function Highlight({ active, children }: { active: boolean; children: ReactNode }) {
  // ref ではなく state に置く。描画中に ref を読むと React の規則に反するため。
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  const borderColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(242,163,41,0.25)", "rgba(242,163,41,1)"],
  });
  return (
    <Animated.View style={[styles.highlight, active && { borderColor }]}>{children}</Animated.View>
  );
}

/** 練習モード共通のボタン。primary は緑、secondary は白。 */
export function TutorialButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const { scale } = useFontSize();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" && styles.buttonTextSecondary,
          { fontSize: 16 * scale },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TUTORIAL_COLORS.background,
    alignItems: "center",
  },
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: TUTORIAL_COLORS.orange,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: {
    color: "#FFFFFF",
    fontWeight: "800",
    flexShrink: 1,
  },
  quitButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  quitText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  coach: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: TUTORIAL_COLORS.orange,
  },
  coachStep: {
    color: TUTORIAL_COLORS.orange,
    fontWeight: "800",
    marginBottom: 4,
  },
  coachTitle: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "800",
    marginBottom: 6,
  },
  coachBody: {
    color: TUTORIAL_COLORS.text,
  },
  body: {
    flex: 1,
  },
  highlight: {
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 999,
  },
  button: {
    borderRadius: 999,
    backgroundColor: TUTORIAL_COLORS.green,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: TUTORIAL_COLORS.green,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  buttonTextSecondary: {
    color: TUTORIAL_COLORS.green,
  },
  pressed: {
    opacity: 0.8,
  },
});
