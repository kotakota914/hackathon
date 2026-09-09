import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useReducer } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useFontSize } from "../../context/FontSizeContext";
import {
  HELPER,
  MINUTE_OPTIONS,
  NEXT_STAGE_POINTS,
  REPLY_SUGGESTIONS,
  TITLE_SUGGESTIONS,
  canPostRequest,
  coachFor,
  hasExchangedMessages,
  initialRequesterState,
  requesterReducer,
  rewardPoints,
  scheduledEvent,
} from "../../features/tutorial/requester";
import { markTutorialCompleted } from "../../features/tutorial/storage";
import {
  Highlight,
  TUTORIAL_COLORS,
  TutorialButton,
  TutorialFrame,
} from "../../shared/tutorial/TutorialUi";

/**
 * 練習モード「依頼者編」。1 画面の中で段階（phase）ごとに中身を切り替える。
 * 進み方は features/tutorial/requester.ts にあり、ここは見た目だけを担当する。
 */
export default function RequesterTutorialScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const returnTo = typeof next === "string" && next.startsWith("/") ? next : "/auth";
  const [state, dispatch] = useReducer(requesterReducer, initialRequesterState);
  const { scale } = useFontSize();
  const fs = (size: number) => size * scale;

  // 架空の相手の自動反応。段階が変わるたびに「次に起こること」を予約し直す。
  useEffect(() => {
    const event = scheduledEvent(state);
    if (!event) return;
    const timer = setTimeout(() => dispatch(event.action), event.after);
    return () => clearTimeout(timer);
  }, [state]);

  const leave = () => router.replace(returnTo as never);
  const finish = () => {
    markTutorialCompleted("requester");
    dispatch({ type: "FINISH" });
    leave();
  };

  const coach = coachFor(state);

  return (
    <TutorialFrame coach={coach} onQuit={leave}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {state.phase === "write" && (
          <View style={styles.card}>
            <Text style={[styles.label, { fontSize: fs(14) }]}>何を手伝ってほしいですか？</Text>
            <TextInput
              accessibilityLabel="依頼の内容"
              value={state.title}
              onChangeText={(title) => dispatch({ type: "SET_TITLE", title })}
              placeholder="例：電球を交換してほしい"
              placeholderTextColor="#9A9A9A"
              style={[styles.input, { fontSize: fs(16) }]}
            />
            <View style={styles.chips}>
              {TITLE_SUGGESTIONS.map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  selected={state.title === suggestion}
                  onPress={() => dispatch({ type: "SET_TITLE", title: suggestion })}
                />
              ))}
            </View>

            <Text style={[styles.label, { fontSize: fs(14), marginTop: 16 }]}>かかりそうな時間</Text>
            <View style={styles.chips}>
              {MINUTE_OPTIONS.map((minutes) => (
                <Chip
                  key={minutes}
                  label={`${minutes}分くらい`}
                  selected={state.minutes === minutes}
                  onPress={() => dispatch({ type: "SET_MINUTES", minutes })}
                />
              ))}
            </View>

            <View style={styles.actions}>
              <Highlight active={canPostRequest(state)}>
                <TutorialButton
                  label="この内容で依頼する"
                  disabled={!canPostRequest(state)}
                  onPress={() => dispatch({ type: "POST_REQUEST" })}
                />
              </Highlight>
            </View>
          </View>
        )}

        {state.phase === "waiting" && (
          <View style={styles.card}>
            <RequestSummary title={state.title} minutes={state.minutes} status="募集中" fs={fs} />
            {state.applicantArrived ? (
              <View style={styles.actions}>
                <View style={styles.notice}>
                  <Ionicons name="notifications" size={20} color={TUTORIAL_COLORS.danger} />
                  <Text style={[styles.noticeText, { fontSize: fs(14) }]}>応募が 1 件届きました</Text>
                </View>
                <Highlight active>
                  <TutorialButton
                    label="応募者を見る"
                    onPress={() => dispatch({ type: "OPEN_APPLICANTS" })}
                  />
                </Highlight>
              </View>
            ) : (
              <Text style={[styles.waitingText, { fontSize: fs(14) }]}>近くの人に届けています…</Text>
            )}
          </View>
        )}

        {state.phase === "applicants" && (
          <View style={styles.card}>
            <RequestSummary title={state.title} minutes={state.minutes} status="応募 1 件" fs={fs} />
            <View style={styles.applicant}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.applicantText}>
                <View style={styles.nameRow}>
                  <Text style={[styles.applicantName, { fontSize: fs(17) }]}>{HELPER.name}</Text>
                  <Ionicons name="shield-checkmark" size={18} color={TUTORIAL_COLORS.green} />
                </View>
                <Text style={[styles.applicantDetail, { fontSize: fs(12) }]}>{HELPER.detail}</Text>
                <Text style={[styles.applicantMessage, { fontSize: fs(14), lineHeight: fs(21) }]}>
                  {HELPER.message}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Highlight active>
                <TutorialButton
                  label="この人にお願いする"
                  onPress={() => dispatch({ type: "SELECT_HELPER" })}
                />
              </Highlight>
            </View>
          </View>
        )}

        {state.phase === "chat" && (
          <View style={styles.card}>
            <View style={styles.chatHeader}>
              <Ionicons name="chatbubble-ellipses" size={20} color={TUTORIAL_COLORS.green} />
              <Text style={[styles.chatTitle, { fontSize: fs(16) }]}>{HELPER.name}さんとのトーク</Text>
            </View>
            <View style={styles.messages}>
              {state.messages.map((message, index) => (
                <View
                  key={`${index}-${message.from}`}
                  style={[styles.bubble, message.from === "me" ? styles.bubbleMe : styles.bubbleHelper]}
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
              {state.awaitingHelperReply ? (
                <Text style={[styles.waitingText, { fontSize: fs(13) }]}>{HELPER.name}さんが入力中…</Text>
              ) : null}
            </View>
            {!hasExchangedMessages(state) && !state.awaitingHelperReply ? (
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
                  <TutorialButton
                    label="手伝ってもらった"
                    onPress={() => dispatch({ type: "MARK_COMPLETE" })}
                  />
                </Highlight>
              </View>
            ) : null}
          </View>
        )}

        {state.phase === "complete" && (
          <View style={styles.card}>
            <Text style={[styles.completeTitle, { fontSize: fs(18) }]}>
              {HELPER.name}さんに手伝ってもらいましたか？
            </Text>
            <Text style={[styles.label, { fontSize: fs(14) }]}>評価（任意）</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  accessibilityRole="button"
                  accessibilityLabel={`星${star}`}
                  onPress={() => dispatch({ type: "SET_RATING", rating: star })}
                  hitSlop={6}
                >
                  <Ionicons
                    name={star <= state.rating ? "star" : "star-outline"}
                    size={34}
                    color={TUTORIAL_COLORS.orange}
                  />
                </Pressable>
              ))}
            </View>
            <View style={styles.actions}>
              <Highlight active>
                <TutorialButton
                  label="完了にする"
                  onPress={() => dispatch({ type: "CONFIRM_COMPLETE" })}
                />
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
            <Text style={[styles.rewardBody, { fontSize: fs(14), lineHeight: fs(22) }]}>
              手伝ってもらうたびにポイントがたまり、{NEXT_STAGE_POINTS} 点で次の姿に育ちます。
            </Text>
            <View style={styles.progressTrack} accessibilityRole="progressbar">
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.round((rewardPoints(state) / NEXT_STAGE_POINTS) * 100))}%` },
                ]}
              />
            </View>
            <Text style={[styles.rewardBody, { fontSize: fs(14), lineHeight: fs(22), marginTop: 16 }]}>
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

function RequestSummary({
  title,
  minutes,
  status,
  fs,
}: {
  title: string;
  minutes: number;
  status: string;
  fs: (size: number) => number;
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHeader}>
        <Text style={[styles.summaryStatus, { fontSize: fs(12) }]}>{status}</Text>
        <Text style={[styles.summaryMeta, { fontSize: fs(12) }]}>{minutes}分くらい</Text>
      </View>
      <Text style={[styles.summaryTitle, { fontSize: fs(17) }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    backgroundColor: TUTORIAL_COLORS.card,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  label: {
    color: TUTORIAL_COLORS.muted,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#DDD5C8",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: TUTORIAL_COLORS.text,
    backgroundColor: "#FFFDF9",
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
  summary: {
    borderRadius: 14,
    backgroundColor: "#FFF5E9",
    padding: 14,
    gap: 6,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryStatus: {
    color: TUTORIAL_COLORS.orange,
    fontWeight: "800",
  },
  summaryMeta: {
    color: TUTORIAL_COLORS.muted,
  },
  summaryTitle: {
    color: TUTORIAL_COLORS.text,
    fontWeight: "800",
  },
  waitingText: {
    color: TUTORIAL_COLORS.muted,
    textAlign: "center",
    marginTop: 8,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  noticeText: {
    color: TUTORIAL_COLORS.danger,
    fontWeight: "800",
  },
  applicant: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#EADFCF",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TUTORIAL_COLORS.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  applicantText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  applicantName: {
    color: TUTORIAL_COLORS.text,
    fontWeight: "800",
  },
  applicantDetail: {
    color: TUTORIAL_COLORS.muted,
  },
  applicantMessage: {
    color: TUTORIAL_COLORS.text,
    marginTop: 4,
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
  bubbleHelper: {
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
  completeTitle: {
    color: TUTORIAL_COLORS.green,
    fontWeight: "800",
  },
  stars: {
    flexDirection: "row",
    gap: 6,
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
