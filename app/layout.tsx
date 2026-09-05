import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "合成大豆包 · Doubao Dance";
const description = "让组织碰撞起来？在一次次组织调整中勇攀高峰，冲击节子范儿排行榜。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "doubao-dance-game.lucky-plum-7420.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const socialImage = new URL("/og.png", `${protocol}://${host}`).href;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "合成大豆包游戏分享预览" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f8ff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
