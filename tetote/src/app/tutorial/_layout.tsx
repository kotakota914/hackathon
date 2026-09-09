import { Stack } from "expo-router";

// 練習モードはログイン前でも開ける（app/_layout.tsx で公開ルートにしてある）。
export default function TutorialLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
