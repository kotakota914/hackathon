import { Stack } from "expo-router";

// 管理者向け画面。ログインは app/_layout.tsx が要求し、ロールは各画面で確認する。
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
