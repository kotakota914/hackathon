import { describe, expect, it } from "vitest";

import manifestSource from "../../../public/manifest.webmanifest?raw";
import serviceWorkerSource from "../../../public/sw.js?raw";

/**
 * PWA の設定ファイルが壊れていないかを確かめる。
 * ホーム画面に追加できる条件: manifest に name / start_url / display / 192 と 512 のアイコン。
 */
type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  icons: { src: string; sizes: string; purpose?: string }[];
};

describe("PWA manifest", () => {
  const manifest = JSON.parse(manifestSource) as Manifest;

  it("ホーム画面に追加できる必須項目がそろっている", () => {
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.short_name).toBe("fitt0");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("192 と 512 のアイコンと maskable がある", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/icons/")).toBe(true);
    }
  });

  it("service worker は API（別オリジン）と GET 以外に触らない", () => {
    expect(serviceWorkerSource).toContain('request.method !== "GET"');
    expect(serviceWorkerSource).toContain("url.origin !== self.location.origin");
  });
});
