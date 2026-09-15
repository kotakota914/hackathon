import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRequests } from "../../context/RequestsContext";
import { useFontSize } from "../../context/FontSizeContext";
import {
  formatScheduledAt,
  listPublicRequests,
  REQUEST_CATEGORIES,
  REQUEST_SORTS,
  requestListErrorMessage,
  tagsForCategory,
  type PublicRequest,
  type RequestSort,
} from "../../features/requests/client";

/**
 * 依頼を探す画面。
 * ホームのカードは 3 件ずつしか見えないので、キーワード・カテゴリ・並び順で
 * 一覧から探せるようにする。条件を変えるたびに API から取り直す。
 */

type LoadStatus = "loading" | "ready" | "error";

const PAGE_SIZE = 20;
// 1 文字打つたびに通信しないよう、入力が止まってから少し待つ。
const KEYWORD_DEBOUNCE_MS = 350;

export default function SearchScreen() {
  const router = useRouter();
  const { scale } = useFontSize();
  const styles = createStyles(scale);
  const { toggleSavedRequest, isRequestSaved } = useRequests();

  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<RequestSort>("newest");
  const [items, setItems] = useState<PublicRequest[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // 入力が止まってから検索語を確定する。
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(keywordInput.trim()), KEYWORD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  // 条件（検索語・カテゴリ・並び順）が変わるたびに 1 ページ目を取り直す。
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setStatus("loading");
        setMessage("");
        return listPublicRequests({ q: keyword, category: category ?? undefined, sort, limit: PAGE_SIZE });
      })
      .then((page) => {
        if (!active || !page) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(requestListErrorMessage(error));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [keyword, category, sort, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listPublicRequests({
        q: keyword, category: category ?? undefined, sort, limit: PAGE_SIZE, cursor: nextCursor,
      });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      setMessage(requestListErrorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, keyword, category, sort]);

  const openRequest = (item: PublicRequest) => {
    router.push({
      pathname: "/helper/request",
      params: { requestId: item.id, title: item.title, description: item.description },
    });
  };

  const hasCondition = keyword.length > 0 || category !== null;

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={21} color="#111111" />
            <Text style={styles.backText}>戻る</Text>
          </Pressable>
          <Text style={styles.headerTitle}>依頼を探す</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#5C6B4A" />
          <TextInput
            accessibilityLabel="キーワードで探す"
            placeholder="例: 買い物、電球、スマホ"
            placeholderTextColor="#8A917C"
            value={keywordInput}
            onChangeText={setKeywordInput}
            onSubmitEditing={() => setKeyword(keywordInput.trim())}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {keywordInput.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="キーワードを消す"
              onPress={() => { setKeywordInput(""); setKeyword(""); }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color="#5C6B4A" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sortRow}>
          {REQUEST_SORTS.map((option) => {
            const selected = option.id === sort;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSort(option.id)}
                style={[styles.sortButton, selected && styles.sortButtonSelected]}
              >
                <Text style={[styles.sortText, selected && styles.sortTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: category === null }}
            onPress={() => setCategory(null)}
            style={[styles.chip, category === null && styles.chipSelected]}
          >
            <Text style={[styles.chipText, category === null && styles.chipTextSelected]}>すべて</Text>
          </Pressable>
          {REQUEST_CATEGORIES.map((option) => {
            const selected = option.id === category;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(selected ? null : option.id)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {status === "loading" ? <ActivityIndicator color="#245C2D" style={styles.spinner} /> : null}

          {status === "error" ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{message}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReloadKey((value) => value + 1)}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>もう一度読み込む</Text>
              </Pressable>
            </View>
          ) : null}

          {status === "ready" && items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={36} color="#245C2D" />
              <Text style={styles.emptyTitle}>
                {hasCondition ? "条件に合う依頼はありません" : "いま募集中の依頼はありません"}
              </Text>
              <Text style={styles.emptyText}>
                {hasCondition ? "キーワードやカテゴリを変えてみてください" : "新しい依頼が出るとここに並びます"}
              </Text>
            </View>
          ) : null}

          {status === "ready"
            ? items.map((item) => {
                const saved = isRequestSaved(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => openRequest(item)}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={saved ? "保存を解除" : "保存する"}
                        onPress={() => toggleSavedRequest(item.id)}
                        hitSlop={8}
                      >
                        <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={24} color="#245C2D" />
                      </Pressable>
                    </View>
                    <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
                    <View style={styles.cardMetaRow}>
                      <Ionicons name="calendar-outline" size={16} color="#5C6B4A" />
                      <Text style={styles.cardMeta}>{formatScheduledAt(item.scheduledAt)}</Text>
                      <Ionicons name="location-outline" size={16} color="#5C6B4A" />
                      <Text style={styles.cardMeta}>{item.areaLabel}</Text>
                    </View>
                    <View style={styles.cardMetaRow}>
                      <Text style={styles.cardMeta}>約{item.estimatedMinutes}分・{item.requiredHelpers}人募集</Text>
                      {tagsForCategory(item.category).map((tag) => (
                        <Text key={tag} style={styles.tag}>{tag}</Text>
                      ))}
                    </View>
                  </Pressable>
                );
              })
            : null}

          {status === "ready" && nextCursor ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMore()}
              disabled={loadingMore}
              style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
            >
              {loadingMore ? (
                <ActivityIndicator color="#245C2D" />
              ) : (
                <Text style={styles.moreText}>もっと見る</Text>
              )}
            </Pressable>
          ) : null}
          {status === "ready" && message ? <Text style={styles.errorText}>{message}</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (scale: number) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#FFF5E9", alignItems: "center" },
    container: { flex: 1, width: "100%", maxWidth: 520, paddingHorizontal: 20, paddingTop: 22 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    backButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingRight: 10 },
    backText: { fontSize: 16 * scale, fontWeight: "700", color: "#111111" },
    headerTitle: { fontSize: 22 * scale, fontWeight: "900", color: "#35410F" },
    headerSpacer: { width: 64 },
    pressed: { opacity: 0.7 },
    searchBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#FFFFFF", borderRadius: 14, paddingHorizontal: 14, height: 52,
      borderWidth: 1, borderColor: "#DCE3D0",
    },
    searchInput: { flex: 1, fontSize: 17 * scale, color: "#111111", paddingVertical: 0 },
    sortRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    sortButton: {
      flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999,
      borderWidth: 1, borderColor: "#245C2D", backgroundColor: "#FFFFFF",
    },
    sortButtonSelected: { backgroundColor: "#245C2D" },
    sortText: { fontSize: 15 * scale, fontWeight: "800", color: "#245C2D" },
    sortTextSelected: { color: "#FFFFFF" },
    chipScroll: { flexGrow: 0, marginTop: 12 },
    chipRow: { gap: 8, paddingRight: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE3D0",
    },
    chipSelected: { backgroundColor: "#F2A329", borderColor: "#F2A329" },
    chipText: { fontSize: 14 * scale, fontWeight: "700", color: "#35410F" },
    chipTextSelected: { color: "#FFFFFF" },
    list: { paddingTop: 14, paddingBottom: 40, gap: 12 },
    spinner: { marginTop: 24 },
    emptyBox: { alignItems: "center", gap: 8, paddingVertical: 40 },
    emptyTitle: { fontSize: 18 * scale, fontWeight: "900", color: "#35410F" },
    emptyText: { fontSize: 14 * scale, color: "#5C6B4A", textAlign: "center" },
    retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: "#245C2D" },
    retryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 * scale },
    card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, gap: 8 },
    cardPressed: { opacity: 0.85 },
    cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
    cardTitle: { flex: 1, fontSize: 18 * scale, fontWeight: "900", color: "#111111" },
    cardDescription: { fontSize: 14 * scale, color: "#3C4535", lineHeight: 20 * scale },
    cardMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    cardMeta: { fontSize: 13 * scale, color: "#5C6B4A", fontWeight: "700", marginRight: 6 },
    tag: {
      fontSize: 12 * scale, fontWeight: "800", color: "#245C2D",
      backgroundColor: "#E8F1E1", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    },
    moreButton: {
      alignSelf: "center", marginTop: 6, paddingHorizontal: 24, height: 46, borderRadius: 999,
      borderWidth: 1, borderColor: "#245C2D", alignItems: "center", justifyContent: "center", minWidth: 160,
    },
    moreText: { fontSize: 15 * scale, fontWeight: "800", color: "#245C2D" },
    errorText: { color: "#A23B32", textAlign: "center", fontSize: 14 * scale },
  });
