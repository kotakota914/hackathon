import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getRequestDetail } from "../../api/request-detail";
import { updateRequest } from "../../api/request-update";
import { deleteRequest } from "../../api/request-deletion";
import type { CreatedRequest } from "../../api/request-creation";
import { useFontSize } from "../../context/FontSizeContext";
import { requestStatusLabel } from "../../features/requests/client";
import {
  HELPER_OPTIONS,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  canCancelRequest,
  canEditRequest,
  cancelResultMessage,
  changedFields,
  formFromRequest,
  formatDateKey,
  shiftDateKey,
  todayKey,
  updateResultMessage,
  validateRequestEdit,
  type RequestEditForm,
} from "../../features/requests/edit";

/**
 * 依頼の編集・取消画面（依頼者向け）。
 * 支援者が決まる前の依頼だけ、タイトル・内容・日時・所要時間・募集人数を直せる。
 * 取消は 2 段階（ボタン → 確認）にして、押し間違いで消えないようにする。
 */

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type LoadStatus = "loading" | "ready" | "error";

export default function RequestEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = firstParam(params.requestId);
  const { scale } = useFontSize();
  const styles = createStyles(scale);

  const [original, setOriginal] = useState<CreatedRequest | null>(null);
  const [form, setForm] = useState<RequestEditForm | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // 依頼を読み込み、編集フォームの初期値にする。
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setStatus("loading");
        return getRequestDetail(requestId);
      })
      .then((state) => {
        if (!active || !state) return;
        if (state.status !== "ready") {
          setMessage(state.status === "not_found" ? "依頼が見つかりませんでした。" : "依頼を読み込めませんでした。");
          setStatus("error");
          return;
        }
        setOriginal(state.request);
        setForm(formFromRequest(state.request));
        setStatus("ready");
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const update = (patch: Partial<RequestEditForm>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setMessage("");
  };

  const save = async () => {
    if (!original || !form || saving) return;
    const problem = validateRequestEdit(form, { acceptedHelpers: original.acceptedHelpers });
    if (problem) {
      setMessage(problem);
      return;
    }
    const changes = changedFields(original, form);
    if (Object.keys(changes).length === 0) {
      setMessage("変更はありません。");
      return;
    }
    setSaving(true);
    const result = await updateRequest(original.id, { ...changes, expectedVersion: original.version });
    setSaving(false);
    if (result.status === "updated") {
      // 内容によっては確認中（pending_review）に戻る。戻り先の一覧で状態が分かる。
      router.replace("/help/requests");
      return;
    }
    if (result.status === "conflict" && result.latestRequest) {
      setOriginal(result.latestRequest);
      setForm(formFromRequest(result.latestRequest));
    }
    setMessage(updateResultMessage(result) ?? "");
  };

  const cancel = async () => {
    if (!original || cancelling) return;
    setCancelling(true);
    const result = await deleteRequest(original.id, []);
    setCancelling(false);
    if (result.status === "deleted") {
      router.replace("/help/requests");
      return;
    }
    setConfirmingCancel(false);
    setMessage(cancelResultMessage(result) ?? "");
  };

  const editable = original ? canEditRequest(original.status) : false;
  const cancellable = original ? canCancelRequest(original.status) : false;
  const today = todayKey();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={21} color="#111111" />
            <Text style={styles.backText}>戻る</Text>
          </Pressable>
          <Text style={styles.headerTitle}>依頼を編集</Text>
          <View style={styles.headerSpacer} />
        </View>

        {status === "loading" ? <ActivityIndicator color="#245C2D" style={styles.spinner} /> : null}
        {status === "error" ? <Text style={styles.error}>{message}</Text> : null}

        {status === "ready" && original && form ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>いまの状態</Text>
              <Text style={styles.statusBadge}>{requestStatusLabel(original.status)}</Text>
            </View>

            {!editable ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  支援者が決まった依頼や終了した依頼は内容を変えられません。変更が必要なときはトークで相談してください。
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>タイトル</Text>
            <TextInput
              accessibilityLabel="タイトル"
              value={form.title}
              onChangeText={(title) => update({ title })}
              editable={editable}
              maxLength={100}
              style={[styles.input, !editable && styles.inputDisabled]}
            />

            <Text style={styles.label}>内容</Text>
            <TextInput
              accessibilityLabel="内容"
              value={form.description}
              onChangeText={(description) => update({ description })}
              editable={editable}
              multiline
              maxLength={2000}
              style={[styles.input, styles.textArea, !editable && styles.inputDisabled]}
            />

            <Text style={styles.label}>希望日</Text>
            <View style={styles.dateRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="前の日"
                disabled={!editable || form.dateKey <= today}
                onPress={() => update({ dateKey: shiftDateKey(form.dateKey, -1) })}
                style={({ pressed }) => [
                  styles.dateButton, pressed && styles.pressed,
                  (!editable || form.dateKey <= today) && styles.dateButtonDisabled,
                ]}
              >
                <Ionicons name="chevron-back" size={22} color="#245C2D" />
              </Pressable>
              <Text style={styles.dateText}>{formatDateKey(form.dateKey)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="次の日"
                disabled={!editable}
                onPress={() => update({ dateKey: shiftDateKey(form.dateKey, 1) })}
                style={({ pressed }) => [styles.dateButton, pressed && styles.pressed, !editable && styles.dateButtonDisabled]}
              >
                <Ionicons name="chevron-forward" size={22} color="#245C2D" />
              </Pressable>
            </View>
            <View style={styles.quickRow}>
              {[{ label: "今日", key: today }, { label: "明日", key: shiftDateKey(today, 1) }, { label: "1週間後", key: shiftDateKey(today, 7) }].map((option) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  disabled={!editable}
                  onPress={() => update({ dateKey: option.key })}
                  style={[styles.chip, form.dateKey === option.key && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, form.dateKey === option.key && styles.chipTextSelected]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>希望時間</Text>
            <View style={styles.wrapRow}>
              {HOUR_OPTIONS.map((hour) => (
                <Pressable
                  key={hour}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.hour === hour }}
                  disabled={!editable}
                  onPress={() => update({ hour })}
                  style={[styles.chip, form.hour === hour && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, form.hour === hour && styles.chipTextSelected]}>{hour}時</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>所要時間（目安）</Text>
            <View style={styles.wrapRow}>
              {MINUTE_OPTIONS.map((minutes) => (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.estimatedMinutes === minutes }}
                  disabled={!editable}
                  onPress={() => update({ estimatedMinutes: minutes })}
                  style={[styles.chip, form.estimatedMinutes === minutes && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, form.estimatedMinutes === minutes && styles.chipTextSelected]}>約{minutes}分</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>募集人数</Text>
            <View style={styles.wrapRow}>
              {HELPER_OPTIONS.map((count) => {
                const tooFew = count < original.acceptedHelpers;
                return (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityState={{ selected: form.requiredHelpers === count }}
                    disabled={!editable || tooFew}
                    onPress={() => update({ requiredHelpers: count })}
                    style={[styles.chip, form.requiredHelpers === count && styles.chipSelected, tooFew && styles.chipDisabled]}
                  >
                    <Text style={[styles.chipText, form.requiredHelpers === count && styles.chipTextSelected]}>{count}人</Text>
                  </Pressable>
                );
              })}
            </View>

            {message ? <Text style={styles.error}>{message}</Text> : null}

            {editable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void save()}
                disabled={saving}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed, saving && styles.disabled]}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>この内容で保存する</Text>}
              </Pressable>
            ) : null}

            {cancellable ? (
              <View style={styles.cancelBox}>
                <Text style={styles.cancelTitle}>依頼を取り消す</Text>
                <Text style={styles.cancelText}>
                  取り消すと募集が終わり、応募してくれた人には取消として伝わります。元に戻せません。
                </Text>
                {confirmingCancel ? (
                  <View style={styles.confirmRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setConfirmingCancel(false)}
                      disabled={cancelling}
                      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryText}>やめる</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void cancel()}
                      disabled={cancelling}
                      style={({ pressed }) => [styles.danger, pressed && styles.pressed, cancelling && styles.disabled]}
                    >
                      {cancelling ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>本当に取り消す</Text>}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setConfirmingCancel(true)}
                    style={({ pressed }) => [styles.dangerOutline, pressed && styles.pressed]}
                  >
                    <Text style={styles.dangerOutlineText}>依頼を取り消す</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (scale: number) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#FFF5E9", alignItems: "center" },
    container: { width: "100%", maxWidth: 520, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 48, gap: 8 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    backButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingRight: 10 },
    backText: { fontSize: 16 * scale, fontWeight: "700", color: "#111111" },
    headerTitle: { fontSize: 22 * scale, fontWeight: "900", color: "#35410F" },
    headerSpacer: { width: 64 },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.6 },
    spinner: { marginTop: 24 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
    statusLabel: { fontSize: 14 * scale, color: "#5C6B4A", fontWeight: "700" },
    statusBadge: {
      fontSize: 13 * scale, fontWeight: "800", color: "#FFFFFF", backgroundColor: "#159326",
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    notice: { backgroundColor: "#FFF0C2", borderRadius: 12, padding: 14 },
    noticeText: { fontSize: 14 * scale, color: "#5A4200", lineHeight: 21 * scale },
    label: { fontSize: 15 * scale, fontWeight: "800", color: "#35410F", marginTop: 12 },
    input: {
      borderWidth: 1, borderColor: "#C8CEBD", borderRadius: 12, padding: 14,
      fontSize: 17 * scale, backgroundColor: "#FFFFFF", color: "#111111",
    },
    inputDisabled: { backgroundColor: "#F1EFEA", color: "#6B6B6B" },
    textArea: { minHeight: 120, textAlignVertical: "top" },
    dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    dateButton: {
      width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
      backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#C8CEBD",
    },
    dateButtonDisabled: { opacity: 0.35 },
    dateText: { flex: 1, textAlign: "center", fontSize: 20 * scale, fontWeight: "900", color: "#111111" },
    quickRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
      backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#C8CEBD",
    },
    chipSelected: { backgroundColor: "#245C2D", borderColor: "#245C2D" },
    chipDisabled: { opacity: 0.35 },
    chipText: { fontSize: 15 * scale, fontWeight: "700", color: "#35410F" },
    chipTextSelected: { color: "#FFFFFF" },
    error: { color: "#A23B32", fontSize: 14 * scale, marginTop: 10, lineHeight: 21 * scale },
    primary: { marginTop: 18, alignItems: "center", justifyContent: "center", height: 54, borderRadius: 14, backgroundColor: "#245C2D" },
    primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 17 * scale },
    cancelBox: { marginTop: 28, padding: 16, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7C9C5", gap: 10 },
    cancelTitle: { fontSize: 16 * scale, fontWeight: "900", color: "#A23B32" },
    cancelText: { fontSize: 14 * scale, color: "#3C4535", lineHeight: 21 * scale },
    confirmRow: { flexDirection: "row", gap: 10 },
    secondary: { flex: 1, alignItems: "center", justifyContent: "center", height: 50, borderRadius: 12, borderWidth: 1, borderColor: "#245C2D", backgroundColor: "#FFFFFF" },
    secondaryText: { color: "#245C2D", fontWeight: "800", fontSize: 16 * scale },
    danger: { flex: 1, alignItems: "center", justifyContent: "center", height: 50, borderRadius: 12, backgroundColor: "#A23B32" },
    dangerOutline: { alignItems: "center", justifyContent: "center", height: 50, borderRadius: 12, borderWidth: 1, borderColor: "#A23B32", backgroundColor: "#FFFFFF" },
    dangerOutlineText: { color: "#A23B32", fontWeight: "800", fontSize: 16 * scale },
  });
