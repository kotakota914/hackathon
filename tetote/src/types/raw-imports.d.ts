// vite / vitest の "?raw" 取り込み（ファイルの中身を文字列として読む）の型。
declare module "*?raw" {
  const content: string;
  export default content;
}
