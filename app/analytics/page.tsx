"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { PUBLIC_GAME_URL, apiUrl, type AnalyticsSummary } from "@/lib/public-api";

const CHANNEL_LABELS: Record<string, string> = {
  wechat_friend: "微信好友",
  wechat_moments: "朋友圈",
  xiaohongshu: "小红书",
  system_share: "系统分享",
  download: "下载图片",
  copy_link: "复制链接",
  other: "其他渠道",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

async function requestAnalytics() {
  const response = await fetch(apiUrl("/api/analytics"), {
    cache: "no-store",
    credentials: "omit",
  });
  const data = await response.json() as AnalyticsSummary & { error?: string };
  if (!response.ok || typeof data.totalPlayers !== "number") throw new Error(data.error || "数据暂时不可用");
  return data;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await requestAnalytics());
    } catch {
      setError("数据暂时连接不上，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestAnalytics().then((data) => {
      if (active) setSummary(data);
    }).catch(() => {
      if (active) setError("数据暂时连接不上，请稍后重试");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="analytics-page-shell">
      <section className="analytics-page-card" aria-labelledby="analytics-title">
        <header className="analytics-page-header">
          <div>
            <p className="eyebrow">ORGANIZATION DATA</p>
            <h1 id="analytics-title">合成大豆包数据看板</h1>
            <p className="analytics-note">独立统计页 · 历史场次按每位花名至少 1 场回填，转发从埋点上线后开始记录</p>
          </div>
          <a href={PUBLIC_GAME_URL}>返回游戏</a>
        </header>

        {loading && <div className="analytics-state">正在拉取全服数据…</div>}
        {!loading && error && (
          <div className="analytics-state is-error">
            <span>{error}</span>
            <button className="secondary-button" type="button" onClick={() => void loadAnalytics()}>重新加载</button>
          </div>
        )}
        {!loading && summary && (
          <>
            <div className="analytics-cards">
              <div><span>总游玩人数</span><strong>{formatNumber(summary.totalPlayers)}</strong><small>去重设备花名</small></div>
              <div><span>总游戏场次</span><strong>{formatNumber(summary.totalSessions)}</strong><small>开始投放即计 1 场</small></div>
              <div><span>转发动作</span><strong>{formatNumber(summary.totalShares)}</strong><small>埋点上线后累计</small></div>
            </div>
            <div className="analytics-section">
              <div className="analytics-section-title"><b>转发渠道</b><span>按动作次数</span></div>
              {summary.channels.length === 0 ? (
                <p className="analytics-empty">暂时还没有转发动作</p>
              ) : (
                <div className="channel-list">
                  {summary.channels.map((item) => {
                    const maximum = Math.max(1, ...summary.channels.map((channel) => channel.count));
                    return (
                      <div className="channel-row" key={item.channel}>
                        <span>{CHANNEL_LABELS[item.channel] || item.channel}</span>
                        <i><b style={{ width: `${Math.max(8, item.count / maximum * 100)}%` }} /></i>
                        <strong>{formatNumber(item.count)}</strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="analytics-section">
              <div className="analytics-section-title"><b>近 14 天趋势</b><span>场次 / 转发</span></div>
              {summary.daily.length === 0 ? <p className="analytics-empty">暂无趋势数据</p> : (
                <div className="daily-list">
                  {summary.daily.map((item) => (
                    <div key={item.day} style={{ "--sessions": Math.min(14, item.sessions) } as CSSProperties}>
                      <span>{item.day.slice(5)}</span><b>{item.sessions}</b><i>{item.shares}</i>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
