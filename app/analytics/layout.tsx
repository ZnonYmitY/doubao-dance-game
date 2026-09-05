import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "合成大豆包数据看板",
  description: "合成大豆包独立数据统计页",
  robots: { index: false, follow: false },
};

export default function AnalyticsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
