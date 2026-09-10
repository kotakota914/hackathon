/**
 * パスワード再設定の画面で使う、入力の確認と文言。
 * SuperTokens の呼び出し自体は auth/client.ts にあり、ここは純粋な関数だけ。
 */

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "メールアドレスを入力してください";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return "メールアドレスの形式が正しくありません";
  return null;
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`;
  if (password !== confirmation) return "2回のパスワードが一致しません";
  return null;
}

/** 送信後の案内。登録の有無を答えない（メールアドレスの存在を推測させない）。 */
export const RESET_MAIL_SENT_MESSAGE =
  "メールを送りました。登録されているメールアドレスなら、数分以内にパスワード再設定の案内が届きます。届かない場合は迷惑メールも確認してください。";

export const RESET_DONE_MESSAGE = "パスワードを変更しました。新しいパスワードでログインしてください。";

export const RESET_LINK_INVALID_MESSAGE =
  "この再設定の案内は期限切れか、すでに使われています。もう一度「パスワードをお忘れですか」からやり直してください。";
