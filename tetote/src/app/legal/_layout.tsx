import { Stack } from "expo-router";

// 利用規約などはログイン前でも開ける（app/_layout.tsx で公開ルートにしてある）。
export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
