/**
 * 練習モードを「やり終えた」記録。端末内にだけ保存し、サーバーには送らない。
 * Web では localStorage、使えない環境（ネイティブ・プライベートモード）では
 * アプリを開いている間だけ覚えるメモリに落とす。
 */

export type TutorialRole = "requester" | "helper";

const KEY_PREFIX = "fitt0.tutorial.completed.";
const memory = new Map<string, string>();

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!candidate) return null;
    // アクセスできるか確かめる。ブロックされた環境では触るだけで例外になる。
    candidate.getItem(KEY_PREFIX + "probe");
    return candidate;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  const store = storage();
  if (store) {
    try {
      return store.getItem(key);
    } catch {
      /* fall through */
    }
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string | null): void {
  const store = storage();
  if (store) {
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
      return;
    } catch {
      /* fall through */
    }
  }
  if (value === null) memory.delete(key);
  else memory.set(key, value);
}

export function hasCompletedTutorial(role: TutorialRole): boolean {
  return read(KEY_PREFIX + role) === "1";
}

export function markTutorialCompleted(role: TutorialRole): void {
  write(KEY_PREFIX + role, "1");
}

/** 設定画面の「もう一度体験する」や、テストで使う。 */
export function resetTutorial(role: TutorialRole): void {
  write(KEY_PREFIX + role, null);
}
