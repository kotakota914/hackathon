import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFontSize } from "../context/FontSizeContext";
import { OFFLINE_MESSAGE, isOnline, serverSnapshot, subscribeOnline } from "../features/network/online";

/**
 * 通信が切れているときだけ画面の上に出る帯。
 * PWA の殻はオフラインでも開くので、「操作できない理由」を一言で伝える。
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, isOnline, serverSnapshot);
  const { scale } = useFontSize();
  if (online) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={18} color="#FFFFFF" />
      <Text style={[styles.text, { fontSize: 13 * scale }]}>{OFFLINE_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#B3261E",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "700",
    flexShrink: 1,
  },
});
