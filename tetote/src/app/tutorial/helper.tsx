import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useReducer, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFontSize } from "../../context/FontSizeContext";
import {
  APPLY_MESSAGES,
  NEARBY_REQUESTS,
  REPLY_SUGGESTIONS,
  SUGGESTED_REQUEST_ID,
  coachFor,
  hasExchangedMessages,
  helperReducer,
  initialHelperState,
  rewardPoints,
  scheduledEvent,
  selectedRequest,
} from "../../features/tutorial/helper";
import { NEXT_STAGE_POINTS } from "../../features/tutorial/requester";
import { markTutorialCompleted } from "../../features/tutorial/storage";
import {
  Highlight,
  TUTORIAL_COLORS,
  TutorialButton,
  TutorialFrame,
} from "../../shared/tutorial/TutorialUi";

/**
 * 練習モード「支援者編」。進み方は features/tutorial/helper.ts、ここは見た目だけ。
 */
export default function HelperTutorialScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const returnTo = typeof next === "string" && next.startsWith("/") ? next : "/auth";
  const [state, dispatch] = useReducer(helperReducer, initialHelperState);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;

  useEffect(() => {
    const event = scheduledEvent(state);
    if (!event) return;
    const timer = setTimeout(() => dispatch(event.action), event.after);
    return () => clearTimeout(timer);
  }, [state]);

  const leave = () => router.replace(returnTo as never);
  const finish = () => {
    markTutorialCompleted("helper");
    dispatch({ type: "FINISH" });
    leave();
  };

  const request = selectedRequest(state);
  const coach = coachFor(state);

  return (
    <TutorialFrame coach={coach} onQuit={leave}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {state.phase === "browse" && (
          <View style={styles.list}>
            {NEARBY_REQUESTS.map((item) => (
              <Highlight key={item.id} active={item.id === SUGGESTED_REQUEST_ID}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => dispatch({ type: "OPEN_REQUEST", id: item.id })}
                  style={({ pressed }) => [styles.requestCard, pressed && styles.pressed]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardDistance, { fontSize: fs(12) }]}>
                      <Ionicons name="walk" size={12} color={TUTORIAL_COLORS.green} /> {item.distance}
                    </Text>
                    <Text style={[styles.cardMeta, { fontSize: fs(12) }]}>{item.minutes}分くらい</Text>
                  </View>
                  <Text style={[styles.cardTitle, { fontSize: fs(17) }]}>{item.title}</Text>
                  <Text style={[styles.cardMeta, { fontSize: fs(13) }]}>{item.requester}さん</Text>
                </Pressable>
              </Highlight>
            ))}
          </View>
        )}

        {state.phase === "detail" && request && (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => dispatch({ type: "BACK_TO_LIST" })}
              style={styles.backLink}
            >
              <Ionicons name="chevron-back" size={18} color={TUTORIAL_COLORS.green} />
              <Text style={[styles.backText, { fontSize: fs(14) }]}>一覧に戻る</Text>
            </Pressable>
            <Text style={[styles.detailTitle, { fontSize: fs(20) }]}>{request.title}</Text>
            <Text style={[styles.cardMeta, { fontSize: fs(13) }]}>
              {request.requester}さん ・ {request.distance} ・ {request.minutes}分くらい
            </Text>
            <Text style={[styles.detailNote, { fontSize: fs(15), lineHeight: fs(23) }]}>{request.note}</Text>

            <Text style={[styles.label, { fontSize: fs(14), marginTop: 12 }]}>ひとこと（任意）</Text>
            <View style={styles.chips}>
              {APPLY_MESSAGES.map((message) => (
                <Chip
                  key={message}
                  label={message}
                  selected={applyMessage === message}
                  onPress={() => setApplyMessage(message)}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <Highlight active>
                <TutorialButton label="応募する" onPress={() => dispatch({ type: "APPLY" })} />
              </Highlight>
            </View>
          </View>
        )}

        {state.phase === "applied" && request && (
          <View style={styles.card}>
            <Text style={[styles.detailTitle, { fontSize: fs(18) }]}>{request.title}</Text>
            <Text style={[styles.cardMeta, { fontSize: fs(13) }]}>{request.requester}さん</Text>
            {applyMessage ? (
              <View style={[styles.bubble, styles.bubbleMe, { alignSelf: "flex-start" }]}>
                <Text style={[styles.bubbleText, styles.bubbleTextMe, { fontSize: fs(14) }]}>
                  {applyMessage}
                </Text>
              </View>
            ) : null}
            {state.chosen ? (
              <View style={styles.actions}>
                <View style={styles.notice}>
                  <Ionicons name="checkmark-circle" size={22} color={TUTORIAL_COLORS.green} />
                  <Text style={[styles.noticeText, { fontSize: fs(15) }]}>あなたが選ばれました</Text>
                </View>
                <Highlight active>
                  <TutorialButton label="トークを開く" onPress={() => dispatch({ type: "OPEN_CHAT" })} />
                </Highlight>
              </View>
            ) : (
              <Text style={[styles.waitingText, { fontSize: fs(14) }]}>応募済み ・ 返事を待っています…</Text>
            )}
          </View>
        )}

        {state.phase === "chat" && request && (
          <View style={styles.card}>
            <View style={styles.chatHeader}>
              <Ionicons name="chatbubble-ellipses" size={20} color={TUTORIAL_COLORS.green} />
              <Text style={[styles.chatTitle, { fontSize: fs(16) }]}>{request.requester}さんとのトーク</Text>
            </View>
            <View style={styles.messages}>
              {state.messages.map((message, index) => (
                <View
                  key={`${index}-${message.from}`}
                  style={[styles.bubble, message.from === "me" ? styles.bubbleMe : styles.bubbleOther]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      message.from === "me" && styles.bubbleTextMe,
                      { fontSize: fs(15), lineHeight: fs(22) },
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
              ))}
              {state.awaitingReply ? (
                <Text style={[styles.waitingText, { fontSize: fs(13) }]}>{request.requester}さんが入力中…</Text>
              ) : null}
            </View>
            {!hasExchangedMessages(state) && !state.awaitingReply ? (
              <View style={styles.chips}>
                {REPLY_SUGGESTIONS.map((reply) => (
                  <Highlight key={reply} active>
                    <Chip label={reply} onPress={() => dispatch({ type: "SEND_MESSAGE", text: reply })} />
                  </Highlight>
                ))}
              </View>
            ) : null}
            {hasExchangedMessages(state) ? (
              <View style={styles.actions}>
                <Highlight active>
                  <TutorialButton label="手伝いを終えた" onPress={() => dispatch({ type: "FINISH_HELP" })} />
                </Highlight>
              </View>
            ) : null}
          </View>
        )}

        {state.phase === "report" && request && (
          <View style={styles.card}>
            <Text style={[styles.detailTitle, { fontSize: fs(18) }]}>
              {request.requester}さんの「{request.title}」を手伝い終えましたか？
            </Text>
            <Text style={[styles.detailNote, { fontSize: fs(14), lineHeight: fs(22) }]}>
              報告すると依頼した人に届きます。相手が確認すると完了になり、ポイントが入ります。
            </Text>
            <View style={styles.actions}>
              <Highlight active>
                <TutorialButton label="完了を報告する" onPress={() => dispatch({ type: "CONFIRM_REPORT" })} />
              </Highlight>
            </View>
          </View>
        )}

        {(state.phase === "reward" || state.phase === "done") && (
          <View style={styles.card}>
            <Image
              source={require("../../../assets/onboarding_asset/c1.png")}
              style={styles.mascot}
              resizeMode="contain"
            />
            <Text style={[styles.rewardTitle, { fontSize: fs(20) }]}>
              ありがとうポイント +{rewardPoints(state)}
            </Text>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { fontSize: fs(22) }]}>1</Text>
                <Text style={[styles.statLabel, { fontSize: fs(12) }]}>お手伝い回数</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { fontSize: fs(22) }]}>{rewardPoints(state)}</Text>
                <Text style={[styles.statLabel, { fontSize: fs(12) }]}>ポイント</Text>
              </View>
            </View>
            <View style={styles.progressTrack} accessibilityRole="progressbar">
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.round((rewardPoints(state) / NEXT_STAGE_POINTS) * 100))}%` },
                ]}
              />
            </View>
            <Text style={[styles.rewardBody, { fontSize: fs(14), lineHeight: fs(22) }]}>
              {NEXT_STAGE_POINTS} 点でキャラクターが次の姿になります。{"\n"}
              練習はここまでです。本番も同じ流れで進みます。
            </Text>
            <View style={styles.actions}>
              <Highlight active>
                <TutorialButton label="練習を終える" onPress={finish} />
              </Highlight>
            </View>
          </View>
        )}
      </ScrollView>
    </TutorialFrame>
  );
}

function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { scale } = useFontSize();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected, { fontSize: 14 * scale }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  list: {
    gap: 12,
  },
  requestCard: {
    backgroundColor: TUTORIAL_COLORS.card,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardDistance: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "700",
  },
  cardMeta: {
    color: TUTORIAL_COLORS.muted,
  },
  cardTitle: {
    color: TUTORIAL_COLORS.text,
    fontWeight: "800",
  },
  card: {
    backgroundColor: TUTORIAL_COLORS.card,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backText: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "700",
  },
  detailTitle: {
    color: TUTORIAL_COLORS.text,
    fontWeight: "800",
  },
  detailNote: {
    color: TUTORIAL_COLORS.text,
  },
  label: {
    color: TUTORIAL_COLORS.muted,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: TUTORIAL_COLORS.green,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: TUTORIAL_COLORS.green,
  },
  chipText: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  actions: {
    marginTop: 12,
    gap: 10,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  noticeText: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "800",
  },
  waitingText: {
    color: TUTORIAL_COLORS.muted,
    textAlign: "center",
    marginTop: 8,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatTitle: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "800",
  },
  messages: {
    gap: 8,
    marginVertical: 8,
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#F1EDE6",
  },
  bubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: TUTORIAL_COLORS.green,
  },
  bubbleText: {
    color: TUTORIAL_COLORS.text,
  },
  bubbleTextMe: {
    color: "#FFFFFF",
  },
  mascot: {
    width: 140,
    height: 140,
    alignSelf: "center",
  },
  rewardTitle: {
    color: TUTORIAL_COLORS.orange,
    fontWeight: "900",
    textAlign: "center",
  },
  rewardBody: {
    color: TUTORIAL_COLORS.text,
    textAlign: "center",
    marginTop: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginVertical: 8,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "900",
  },
  statLabel: {
    color: TUTORIAL_COLORS.muted,
  },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EADFCF",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: TUTORIAL_COLORS.orange,
  },
  pressed: {
    opacity: 0.8,
  },
});
