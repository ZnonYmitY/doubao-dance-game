"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import QRCode from "qrcode";
import { getPerformanceRating, getPerformanceSummary } from "@/lib/performance";
import {
  PUBLIC_API_BASE,
  PUBLIC_GAME_URL,
  apiUrl,
  type LeaderboardEntry,
} from "@/lib/public-api";
import {
  CONTACT_SOLVER_ITERATIONS,
  constrainBodyToBoard,
  getPhysicsSubsteps,
  resolveCircleContact,
} from "@/lib/physics";

type Level = {
  name: string;
  key: string;
  color: string;
  accent: string;
  radius: number;
  score: number;
  symbol: string;
  icon: string;
};

type Ball = {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  bornAt: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type MountainAnimation = {
  from: number;
  to: number;
  elapsed: number;
  duration: number;
};

type ShareChannel = "wechat_friend" | "wechat_moments" | "system_share" | "download" | "copy_link";

const LEVELS: Level[] = [
  { name: "Mira", key: "mira", color: "#20d8ff", accent: "#127cfe", radius: 19, score: 2, symbol: "✦", icon: "/icons/level-01-mira.png" },
  { name: "AIME", key: "aime", color: "#7259ff", accent: "#4b32c5", radius: 24, score: 4, symbol: "◆", icon: "/icons/level-02-aime.png" },
  { name: "Coze", key: "coze", color: "#ff4a92", accent: "#df1f70", radius: 30, score: 8, symbol: "∞", icon: "/icons/level-03-coze.png" },
  { name: "飞书", key: "feishu", color: "#3370ff", accent: "#14c9c9", radius: 38, score: 16, symbol: "◇", icon: "/icons/level-04-feishu.png" },
  { name: "豆包工作", key: "doubao-work", color: "#12bfa6", accent: "#087d87", radius: 47, score: 32, symbol: "▣", icon: "/icons/level-05-doubao-work.png" },
  { name: "豆包", key: "doubao", color: "#ff7147", accent: "#ff3f77", radius: 58, score: 64, symbol: "●", icon: "/icons/level-06-doubao.png" },
  { name: "Doubao Dance", key: "doubao-dance", color: "#18234d", accent: "#ff3f8e", radius: 70, score: 128, symbol: "≋", icon: "/icons/level-07-doubao-dance.png" },
  { name: "大豆包", key: "real-doubao", color: "#f5d6a7", accent: "#a94e28", radius: 64, score: 300, symbol: "包", icon: "/icons/level-08-real-doubao.png" },
];

const GAME_WIDTH = 390;
const GAME_HEIGHT = 560;
const DANCE_LEVEL = 6;
const FINAL_LEVEL = 7;
const DROP_COOLDOWN = 430;
const DANGER_DURATION = 2500;
const DROP_POOL = [0, 0, 0, 0, 1, 1, 2];
const LEADERBOARD_CACHE_KEY = "doubao-dance-leaderboard-cache";
const INVITE_SHARE_COPY = "让组织碰撞起来？从 Mira 一路合成到 Doubao Dance，合出大豆包，勇攀高峰。";

const pickDropLevel = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];

function readLocalValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function createPlayerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function createTrackingId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function publicAsset(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function gameShareUrl() {
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return new URL(import.meta.env.BASE_URL || "/", window.location.origin).href;
  }
  return PUBLIC_GAME_URL;
}

function normalizeUsername(value: string) {
  return value.trim();
}

function isValidAlias(value: string) {
  return /^[\p{Script=Han}]{2,3}$/u.test(normalizeUsername(value));
}

function readCachedLeaderboard() {
  const cached = readLocalValue(LEADERBOARD_CACHE_KEY);
  if (!cached) return [];
  try {
    const entries = JSON.parse(cached) as unknown;
    return Array.isArray(entries) ? entries as LeaderboardEntry[] : [];
  } catch {
    return [];
  }
}

function cacheLeaderboard(entries: LeaderboardEntry[]) {
  writeLocalValue(LEADERBOARD_CACHE_KEY, JSON.stringify(entries));
}

async function fetchLeaderboard() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(apiUrl("/api/leaderboard"), {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    const data = await response.json() as { entries?: LeaderboardEntry[]; error?: string };
    if (!response.ok || !data.entries) throw new Error(data.error || "排行榜暂时不可用");
    return data.entries;
  } finally {
    window.clearTimeout(timeout);
  }
}

function fetchLeaderboardWithJsonp() {
  return new Promise<LeaderboardEntry[]>((resolve, reject) => {
    const callbackName = `doubaoLeaderboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const callbackHost = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.remove();
      delete callbackHost[callbackName];
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("排行榜备用通道超时"));
    }, 7_000);

    callbackHost[callbackName] = (data: { entries?: LeaderboardEntry[] }) => {
      cleanup();
      if (!data.entries) reject(new Error("排行榜备用数据无效"));
      else resolve(data.entries);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("排行榜备用通道不可用"));
    };
    script.src = `${PUBLIC_API_BASE}/api/leaderboard?callback=${encodeURIComponent(callbackName)}&v=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function LevelBadge({ levelIndex, compact = false }: { levelIndex: number; compact?: boolean }) {
  const level = LEVELS[levelIndex];
  const [imageFailed, setImageFailed] = useState(false);
  const isDance = levelIndex === DANCE_LEVEL;
  const hasImage = !imageFailed;

  return (
    <span
      className={`level-badge level-${levelIndex}${compact ? " is-compact" : ""}${hasImage ? " has-image" : ""}`}
      style={{ "--level-color": level.color, "--level-accent": level.accent } as CSSProperties}
      aria-label={level.name}
      title={level.name}
    >
      {isDance ? (
        <span className="dance-badge-copy" aria-hidden="true">
          <span className="dance-mini-mark"><i /><i /><i /></span>
          <b>Doubao</b>
          <b>Dance</b>
        </span>
      ) : (
        <>
          {imageFailed && <span aria-hidden="true">{level.symbol}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={hasImage ? "is-visible" : ""}
            src={publicAsset(level.icon)}
            alt=""
            onLoad={() => setImageFailed(false)}
            onError={() => setImageFailed(true)}
          />
        </>
      )}
    </span>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getMergeToast(newLevel: number, streak: number) {
  let milestone = "";
  if (newLevel === DANCE_LEVEL) milestone = "豆包开始 Dance！";
  else if (newLevel === 5) milestone = "卷起来！";
  else if (newLevel === 4) milestone = "开始认真工作";
  else if (newLevel === 3) milestone = "协作起来了";

  if (newLevel === DANCE_LEVEL || streak < 2) return milestone;
  const combo = streak >= 4 ? "超预期交付" : streak >= 3 ? "协同效率拉满" : "高效对齐";
  return milestone ? `${combo} · ${milestone}` : combo;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const iconsRef = useRef<Array<HTMLImageElement | null>>([]);
  const dimensionsRef = useRef({ width: GAME_WIDTH, height: GAME_HEIGHT, dpr: 1 });
  const aimXRef = useRef(195);
  const currentLevelRef = useRef(0);
  const nextLevelRef = useRef(0);
  const scoreRef = useRef(0);
  const adjustmentsRef = useRef(0);
  const peaksRef = useRef(0);
  const dancesRef = useRef(0);
  const lastDropRef = useRef(-Infinity);
  const nextIdRef = useRef(1);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const dangerElapsedRef = useRef(0);
  const dangerProgressRef = useRef(0);
  const mountainRiseRef = useRef(0);
  const mountainAnimationRef = useRef<MountainAnimation | null>(null);
  const lastDangerUiRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const pausedRef = useRef(true);
  const gameOverRef = useRef(false);
  const soundEnabledRef = useRef(true);
  const vibrationEnabledRef = useRef(true);
  const usernameRef = useRef("");
  const playerIdRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const idleDropTimersRef = useRef<Set<number>>(new Set());
  const lastMergeAtRef = useRef(-Infinity);
  const mergeStreakRef = useRef(0);
  const missedMergeDropsRef = useRef(0);
  const sessionIdRef = useRef(0);
  const analyticsSessionIdRef = useRef("");
  const analyticsSessionTrackedRef = useRef(false);
  const sourceChannelRef = useRef("direct");
  const shareFileRef = useRef<File | null>(null);
  const shareFilenameRef = useRef("合成大豆包-年度总结.png");
  const shareTextRef = useRef("");

  const [score, setScore] = useState(0);
  const [adjustments, setAdjustments] = useState(0);
  const [peaks, setPeaks] = useState(0);
  const [dances, setDances] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [bestPeaks, setBestPeaks] = useState(0);
  const [nextLevel, setNextLevel] = useState(0);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [dangerProgress, setDangerProgress] = useState(0);
  const [toast, setToast] = useState("");
  const [profileReady, setProfileReady] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [leaderboardNotice, setLeaderboardNotice] = useState("");
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [scoreSyncState, setScoreSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shareState, setShareState] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [sharePreviewUrl, setSharePreviewUrl] = useState("");
  const [shareHint, setShareHint] = useState("长按图片可直接保存到手机相册");
  const [inviteShareOpen, setInviteShareOpen] = useState(false);
  const [inviteQrUrl, setInviteQrUrl] = useState("");
  const [inviteShareHint, setInviteShareHint] = useState("扫码或转发链接，邀请同事来一局");
  const syncScore = useCallback((delta: number) => {
    scoreRef.current += delta;
    setScore(scoreRef.current);
  }, []);

  const syncAdjustments = useCallback(() => {
    adjustmentsRef.current += 1;
    setAdjustments(adjustmentsRef.current);
  }, []);

  const showToast = useCallback((message: string, duration = 900) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), duration);
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (vibrationEnabledRef.current && "vibrate" in navigator) navigator.vibrate(pattern);
  }, []);

  const playTone = useCallback((frequency: number, duration = 0.08, delay = 0, volume = 0.035) => {
    if (!soundEnabledRef.current) return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.06, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }, []);

  const levelRadius = useCallback((level: number) => LEVELS[level].radius, []);

  const targetMountainRise = useCallback((peakCount = peaksRef.current) => {
    const { height } = dimensionsRef.current;
    return Math.min(height * 0.44, peakCount * height * 0.1);
  }, []);

  const floorY = useCallback(() => dimensionsRef.current.height - 15 - mountainRiseRef.current, []);

  const dangerY = useCallback(() => {
    const { height } = dimensionsRef.current;
    return Math.max(94, Math.min(120, height * 0.2));
  }, []);

  const addParticles = useCallback((x: number, y: number, color: string, count: number, force = 175) => {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.3;
      const speed = force * (0.42 + Math.random() * 0.7);
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        size: 2.5 + Math.random() * 4,
        color,
      });
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError("");
    setLeaderboardNotice("");
    try {
      let entries: LeaderboardEntry[];
      try {
        entries = await fetchLeaderboard();
      } catch {
        entries = await fetchLeaderboardWithJsonp();
        setLeaderboardNotice("已通过兼容通道同步排行榜");
      }
      cacheLeaderboard(entries);
      setLeaderboardEntries(entries);
    } catch {
      const cachedEntries = readCachedLeaderboard();
      if (cachedEntries.length > 0) {
        setLeaderboardEntries(cachedEntries);
        setLeaderboardNotice("网络波动，当前显示最近一次同步结果");
      } else {
        setLeaderboardError("排行榜暂时连接不上，请检查网络后重试");
      }
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const claimAlias = useCallback(async (playerId: string, alias: string) => {
    try {
      const response = await fetch(apiUrl("/api/leaderboard"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, username: alias }),
      });
      const data = await response.json() as { username?: string; error?: string };
      return { ok: response.ok, status: response.status, error: data.error || "花名登记失败" };
    } catch {
      return { ok: false, status: 0, error: "网络开小差了，请稍后再试" };
    }
  }, []);

  const submitResult = useCallback(async (result: {
    score: number;
    adjustments: number;
    peaks: number;
    dances: number;
  }) => {
    if (!usernameRef.current || !playerIdRef.current) return;
    setScoreSyncState("saving");
    try {
      const response = await fetch(apiUrl("/api/leaderboard"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: playerIdRef.current,
          username: usernameRef.current,
          ...result,
        }),
      });
      const data = await response.json() as { entries?: LeaderboardEntry[]; rank?: number | null; error?: string };
      if (!response.ok || !data.entries) throw new Error(data.error || "成绩提交失败");
      setLeaderboardEntries(data.entries);
      cacheLeaderboard(data.entries);
      setMyRank(data.rank ?? null);
      setScoreSyncState("saved");
    } catch {
      setScoreSyncState("error");
    }
  }, []);

  const postAnalytics = useCallback(async (payload: Record<string, string>) => {
    if (!playerIdRef.current) return;
    await fetch(apiUrl("/api/analytics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: playerIdRef.current, ...payload }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const endGame = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    pausedRef.current = true;
    activePointerIdRef.current = null;
    setGameOver(true);
    dangerProgressRef.current = 0;
    setDangerProgress(0);
    const newBestScore = Math.max(bestScore, scoreRef.current);
    const newBestPeaks = Math.max(bestPeaks, peaksRef.current);
    setBestScore(newBestScore);
    setBestPeaks(newBestPeaks);
    writeLocalValue("doubao-dance-best-score", String(newBestScore));
    writeLocalValue("doubao-dance-best-peaks", String(newBestPeaks));
    void submitResult({
      score: scoreRef.current,
      adjustments: adjustmentsRef.current,
      peaks: peaksRef.current,
      dances: dancesRef.current,
    });
    vibrate([70, 45, 110]);
    playTone(230, 0.18, 0, 0.028);
    playTone(175, 0.28, 0.14, 0.024);
  }, [bestPeaks, bestScore, playTone, submitResult, vibrate]);

  const resetGame = useCallback(() => {
    idleDropTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    idleDropTimersRef.current.clear();
    sessionIdRef.current += 1;
    ballsRef.current = [];
    particlesRef.current = [];
    scoreRef.current = 0;
    adjustmentsRef.current = 0;
    peaksRef.current = 0;
    dancesRef.current = 0;
    mountainRiseRef.current = 0;
    mountainAnimationRef.current = null;
    dangerElapsedRef.current = 0;
    dangerProgressRef.current = 0;
    lastDropRef.current = -Infinity;
    lastMergeAtRef.current = -Infinity;
    mergeStreakRef.current = 0;
    missedMergeDropsRef.current = 0;
    gameOverRef.current = false;
    analyticsSessionIdRef.current = createTrackingId("session");
    analyticsSessionTrackedRef.current = false;
    pausedRef.current = false;
    activePointerIdRef.current = null;
    const first = pickDropLevel();
    const next = pickDropLevel();
    currentLevelRef.current = first;
    nextLevelRef.current = next;
    aimXRef.current = dimensionsRef.current.width / 2;
    setScore(0);
    setAdjustments(0);
    setPeaks(0);
    setDances(0);
    setNextLevel(next);
    setDangerProgress(0);
    setStarted(false);
    setGameOver(false);
    setSettingsOpen(false);
    setShareState("idle");
    setSharePreviewUrl("");
    setInviteShareOpen(false);
    shareFileRef.current = null;
    setMyRank(null);
    setScoreSyncState("idle");
    setToast("");
  }, []);

  const dropCurrent = useCallback(() => {
    if (pausedRef.current || gameOverRef.current) return;
    const now = performance.now();
    if (now - lastDropRef.current < DROP_COOLDOWN) return;
    const level = currentLevelRef.current;
    if (!analyticsSessionTrackedRef.current) {
      analyticsSessionTrackedRef.current = true;
      void postAnalytics({
        eventType: "game_start",
        sessionId: analyticsSessionIdRef.current,
        sourceChannel: sourceChannelRef.current,
      });
    }
    const radius = levelRadius(level);
    const width = dimensionsRef.current.width;
    const x = Math.max(radius + 3, Math.min(width - radius - 3, aimXRef.current));
    ballsRef.current.push({
      id: nextIdRef.current++,
      level,
      x,
      y: 48 + radius,
      vx: (Math.random() - 0.5) * 10,
      vy: 15,
      angle: 0,
      angularVelocity: (Math.random() - 0.5) * 0.4,
      bornAt: now,
    });
    lastDropRef.current = now;
    const adjustmentsAtDrop = adjustmentsRef.current;
    const sessionId = sessionIdRef.current;
    const idleTimer = window.setTimeout(() => {
      idleDropTimersRef.current.delete(idleTimer);
      if (sessionId !== sessionIdRef.current || gameOverRef.current || pausedRef.current) return;
      if (adjustmentsRef.current !== adjustmentsAtDrop) {
        missedMergeDropsRef.current = 0;
        return;
      }
      missedMergeDropsRef.current += 1;
      if (missedMergeDropsRef.current >= 3) {
        missedMergeDropsRef.current = 0;
        showToast("非核心环节延后处理", 1250);
      }
    }, 1500);
    idleDropTimersRef.current.add(idleTimer);
    setStarted(true);
    playTone(310 + level * 35, 0.055, 0, 0.022);
    vibrate(8);
    const upcoming = nextLevelRef.current;
    const following = pickDropLevel();
    currentLevelRef.current = upcoming;
    nextLevelRef.current = following;
    setNextLevel(following);
  }, [levelRadius, playTone, postAnalytics, showToast, vibrate]);

  const setAimFromClientX = useCallback((clientX: number) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const radius = levelRadius(currentLevelRef.current);
    const logicalX = ((clientX - rect.left) / rect.width) * GAME_WIDTH;
    aimXRef.current = Math.max(radius + 3, Math.min(GAME_WIDTH - radius - 3, logicalX));
  }, [levelRadius]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== event.pointerId) return;
    setAimFromClientX(event.clientX);
  }, [setAimFromClientX]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setAimFromClientX(event.clientX);
  }, [setAimFromClientX]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    setAimFromClientX(event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dropCurrent();
  }, [dropCurrent, setAimFromClientX]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLCanvasElement>) => {
    const radius = levelRadius(currentLevelRef.current);
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      aimXRef.current = Math.max(radius + 3, aimXRef.current - 18);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      aimXRef.current = Math.min(dimensionsRef.current.width - radius - 3, aimXRef.current + 18);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      dropCurrent();
    }
  }, [dropCurrent, levelRadius]);

  useEffect(() => {
    const idleDropTimers = idleDropTimersRef.current;
    const storedSound = readLocalValue("doubao-dance-sound") !== "off";
    const storedVibration = readLocalValue("doubao-dance-vibration") !== "off";
    const storedBestScore = Number(readLocalValue("doubao-dance-best-score") || 0);
    const storedBestPeaks = Number(readLocalValue("doubao-dance-best-peaks") || 0);
    const storedUsername = normalizeUsername(readLocalValue("doubao-dance-username") || "");
    const storedAliasIsValid = isValidAlias(storedUsername);
    const storedPlayerId = readLocalValue("doubao-dance-player-id") || createPlayerId();
    const sourceChannel = new URLSearchParams(window.location.search).get("from")?.toLowerCase() ?? "direct";
    const first = pickDropLevel();
    const next = pickDropLevel();
    const hydrationFrame = window.requestAnimationFrame(() => {
      soundEnabledRef.current = storedSound;
      vibrationEnabledRef.current = storedVibration;
      currentLevelRef.current = first;
      nextLevelRef.current = next;
      setSoundEnabled(storedSound);
      setVibrationEnabled(storedVibration);
      setBestScore(storedBestScore);
      setBestPeaks(storedBestPeaks);
      setNextLevel(next);
      usernameRef.current = storedAliasIsValid ? storedUsername : "";
      playerIdRef.current = storedPlayerId;
      analyticsSessionIdRef.current = createTrackingId("session");
      analyticsSessionTrackedRef.current = false;
      sourceChannelRef.current = /^[a-z0-9_-]{1,32}$/.test(sourceChannel) ? sourceChannel : "direct";
      setUsername(storedAliasIsValid ? storedUsername : "");
      setUsernameDraft(storedAliasIsValid ? storedUsername : "");
      setProfileReady(true);
      pausedRef.current = !storedAliasIsValid;
      writeLocalValue("doubao-dance-player-id", storedPlayerId);
      if (storedAliasIsValid) {
        void claimAlias(storedPlayerId, storedUsername).then((result) => {
          if (result.status !== 409) return;
          usernameRef.current = "";
          pausedRef.current = true;
          setUsername("");
          setUsernameDraft("");
          setUsernameError(result.error);
          writeLocalValue("doubao-dance-username", "");
        });
      }
    });

    iconsRef.current = LEVELS.map((level, index) => {
      const image = new Image();
      image.onload = () => { iconsRef.current[index] = image; };
      image.onerror = () => { iconsRef.current[index] = null; };
      image.src = publicAsset(level.icon);
      return null;
    });

    return () => {
      window.cancelAnimationFrame(hydrationFrame);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      idleDropTimers.forEach((timer) => window.clearTimeout(timer));
      idleDropTimers.clear();
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, [claimAlias]);

  useEffect(() => {
    const board = boardRef.current;
    const canvas = canvasRef.current;
    if (!board || !canvas) return;

    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dimensionsRef.current = { width: GAME_WIDTH, height: GAME_HEIGHT, dpr };
      canvas.width = Math.round(GAME_WIDTH * dpr);
      canvas.height = Math.round(GAME_HEIGHT * dpr);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const drawFallbackGlyph = (ball: Ball, radius: number) => {
      const level = ball.level;
      context.save();
      context.translate(ball.x, ball.y);
      context.rotate(ball.angle);
      context.strokeStyle = "rgba(255,255,255,.95)";
      context.fillStyle = "rgba(255,255,255,.95)";
      context.lineWidth = Math.max(2, radius * 0.09);
      context.lineCap = "round";
      context.lineJoin = "round";
      const size = radius * 0.68;

      if (level === 0) {
        context.beginPath();
        context.moveTo(0, -size);
        context.quadraticCurveTo(size * 0.13, -size * 0.13, size, 0);
        context.quadraticCurveTo(size * 0.13, size * 0.13, 0, size);
        context.quadraticCurveTo(-size * 0.13, size * 0.13, -size, 0);
        context.quadraticCurveTo(-size * 0.13, -size * 0.13, 0, -size);
        context.fill();
      } else if (level === 1) {
        context.rotate(Math.PI / 4);
        context.strokeRect(-size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
        context.strokeRect(-size * 0.27, -size * 0.27, size * 0.54, size * 0.54);
      } else if (level === 2) {
        context.beginPath();
        context.arc(-size * 0.3, 0, size * 0.48, 0, Math.PI * 2);
        context.arc(size * 0.3, 0, size * 0.48, 0, Math.PI * 2);
        context.stroke();
      } else if (level === 3) {
        const block = size * 0.65;
        context.save();
        context.rotate(Math.PI / 4);
        context.fillRect(-block, -block, block * 0.78, block * 0.78);
        context.fillRect(block * 0.22, -block, block * 0.78, block * 0.78);
        context.fillRect(-block, block * 0.22, block * 0.78, block * 0.78);
        context.fillRect(block * 0.22, block * 0.22, block * 0.78, block * 0.78);
        context.restore();
      } else if (level === 4) {
        context.beginPath();
        context.roundRect(-size * 0.8, -size * 0.45, size * 1.6, size * 1.1, radius * 0.12);
        context.stroke();
        context.beginPath();
        context.moveTo(-size * 0.3, -size * 0.48);
        context.lineTo(-size * 0.3, -size * 0.75);
        context.lineTo(size * 0.3, -size * 0.75);
        context.lineTo(size * 0.3, -size * 0.48);
        context.stroke();
      } else if (level === 5) {
        context.beginPath();
        context.roundRect(-size * 0.85, -size * 0.62, size * 1.7, size * 1.2, radius * 0.22);
        context.stroke();
        context.beginPath();
        context.moveTo(-size * 0.15, size * 0.58);
        context.lineTo(-size * 0.4, size * 0.86);
        context.lineTo(size * 0.2, size * 0.58);
        context.stroke();
        context.beginPath();
        context.arc(-size * 0.3, -size * 0.02, radius * 0.07, 0, Math.PI * 2);
        context.arc(size * 0.3, -size * 0.02, radius * 0.07, 0, Math.PI * 2);
        context.fill();
      } else if (level === DANCE_LEVEL) {
        const band = size * 0.17;
        [-0.48, 0, 0.48].forEach((offset, index) => {
          context.save();
          context.translate(0, size * offset);
          context.rotate(-0.18);
          context.fillStyle = index === 0 ? "#22d6ff" : index === 1 ? "#ffffff" : "#ff3f8e";
          context.roundRect(-size * 0.75, -band, size * 1.5, band * 2, band);
          context.fill();
          context.restore();
        });
      } else {
        context.fillStyle = "#fff1d6";
        context.beginPath();
        context.arc(0, 0, size * 0.9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#8f3d24";
        context.font = `900 ${size * 0.72}px "PingFang SC", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("包", 0, size * 0.06);
      }
      context.restore();
    };

    const drawBall = (ball: Ball) => {
      const radius = levelRadius(ball.level);
      const level = LEVELS[ball.level];
      const icon = iconsRef.current[ball.level];
      const hasIcon = Boolean(icon && icon.complete && icon.naturalWidth > 4);
      context.save();
      context.shadowColor = "rgba(17, 27, 67, .2)";
      context.shadowBlur = Math.max(7, radius * 0.2);
      context.shadowOffsetY = Math.max(3, radius * 0.1);
      if (ball.level === FINAL_LEVEL && hasIcon && icon) {
        const size = radius * 2.18;
        context.drawImage(icon, ball.x - size / 2, ball.y - size / 2, size, size);
        context.restore();
        return;
      }
      const gradient = context.createRadialGradient(
        ball.x - radius * 0.34,
        ball.y - radius * 0.42,
        radius * 0.08,
        ball.x,
        ball.y,
        radius,
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.1, level.color);
      gradient.addColorStop(1, level.accent);
      if (ball.level === DANCE_LEVEL) {
        const bubbleGradient = context.createRadialGradient(
          ball.x - radius * 0.38,
          ball.y - radius * 0.45,
          radius * 0.06,
          ball.x,
          ball.y,
          radius,
        );
        bubbleGradient.addColorStop(0, "rgba(255,255,255,.96)");
        bubbleGradient.addColorStop(0.42, "rgba(226,240,255,.68)");
        bubbleGradient.addColorStop(0.78, "rgba(112,146,255,.34)");
        bubbleGradient.addColorStop(1, "rgba(255,63,142,.28)");
        context.fillStyle = bubbleGradient;
      } else {
        context.fillStyle = hasIcon ? "#ffffff" : gradient;
      }
      context.beginPath();
      context.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowColor = "transparent";
      context.lineWidth = Math.max(2, radius * 0.06);
      context.strokeStyle = "rgba(255,255,255,.84)";
      context.stroke();

      if (hasIcon && icon) {
        if (ball.level === DANCE_LEVEL) {
          context.save();
          context.beginPath();
          context.arc(ball.x, ball.y, radius * 0.91, 0, Math.PI * 2);
          context.clip();
          context.drawImage(
            icon,
            10,
            205,
            105,
            105,
            ball.x - radius * 0.4,
            ball.y - radius * 0.68,
            radius * 0.8,
            radius * 0.64,
          );
          context.fillStyle = "#1551d6";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.font = `850 ${Math.max(8, radius * 0.22)}px Inter, system-ui, sans-serif`;
          context.fillText("Doubao", ball.x, ball.y + radius * 0.08);
          context.fillText("Dance", ball.x, ball.y + radius * 0.34);
          context.restore();
        } else {
          context.save();
          context.beginPath();
          context.arc(ball.x, ball.y, radius * 0.91, 0, Math.PI * 2);
          context.clip();
          const size = radius * 1.92;
          context.drawImage(icon, ball.x - size / 2, ball.y - size / 2, size, size);
          context.restore();
        }
      } else {
        drawFallbackGlyph(ball, radius);
      }
      context.restore();
    };

    const drawMountain = (width: number, height: number) => {
      if (peaksRef.current === 0) return;
      const top = floorY();
      const rise = height - top;
      const gradient = context.createLinearGradient(0, top, width, height);
      gradient.addColorStop(0, "#22d6ff");
      gradient.addColorStop(0.5, "#3370ff");
      gradient.addColorStop(1, "#ff3f8e");
      context.save();
      context.beginPath();
      context.moveTo(0, height);
      context.lineTo(0, top + rise * 0.58);
      context.lineTo(width * 0.18, top + rise * 0.28);
      context.lineTo(width * 0.31, top + rise * 0.52);
      context.lineTo(width * 0.49, top);
      context.lineTo(width * 0.67, top + rise * 0.44);
      context.lineTo(width * 0.82, top + rise * 0.2);
      context.lineTo(width, top + rise * 0.55);
      context.lineTo(width, height);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      const labelY = Math.min(height - 18, top + Math.max(20, Math.min(36, rise * 0.38)));
      context.font = `800 ${Math.min(16, width * 0.04)}px "PingFang SC", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(14, 31, 83, .5)";
      context.shadowColor = "rgba(10, 28, 80, .3)";
      context.shadowBlur = 7;
      context.strokeText("勇 攀 高 峰", width / 2, labelY + 1);
      context.fillStyle = "white";
      context.fillText("勇 攀 高 峰", width / 2, labelY + 1);
      context.shadowColor = "transparent";

      const animation = mountainAnimationRef.current;
      if (animation) {
        const progress = Math.min(1, Math.max(0, animation.elapsed / animation.duration));
        const glow = Math.sin(progress * Math.PI);
        context.globalAlpha = 0.25 + glow * 0.7;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2 + glow * 4;
        context.beginPath();
        context.moveTo(0, top + 1);
        context.lineTo(width, top + 1);
        context.stroke();
        context.globalAlpha = glow * 0.7;
        context.strokeStyle = "#22d6ff";
        context.lineWidth = 2;
        [0.25, 0.5, 0.75].forEach((position) => {
          const x = width * position;
          context.beginPath();
          context.moveTo(x - 6, top + 10);
          context.lineTo(x, top + 3);
          context.lineTo(x + 6, top + 10);
          context.stroke();
        });
        context.globalAlpha = 1;
      }
      context.restore();
    };

    const drawParticles = (delta: number) => {
      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.life -= delta;
        if (particle.life <= 0) return false;
        particle.vy += 350 * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        const alpha = Math.min(1, particle.life / Math.max(0.01, particle.maxLife * 0.45));
        context.globalAlpha = alpha;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        return true;
      });
    };

    const drawScene = (delta: number) => {
      const { width, height, dpr } = dimensionsRef.current;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const lineY = dangerY();
      context.save();
      context.setLineDash([7, 7]);
      const currentDangerProgress = dangerProgressRef.current;
      context.strokeStyle = currentDangerProgress > 0 ? "rgba(255,45,116,.9)" : "rgba(255,63,142,.48)";
      context.lineWidth = currentDangerProgress > 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(0, lineY);
      context.lineTo(width, lineY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = currentDangerProgress > 0 ? "#ff2d74" : "#c56a91";
      context.font = "700 9px system-ui, sans-serif";
      context.textAlign = "right";
      context.fillText(currentDangerProgress > 0 ? `空间预警 ${Math.ceil((100 - currentDangerProgress) / 40)}s` : "组织空间警戒线", width - 10, lineY - 8);
      context.restore();

      if (!gameOverRef.current && !pausedRef.current) {
        const radius = levelRadius(currentLevelRef.current);
        const x = Math.max(radius + 3, Math.min(width - radius - 3, aimXRef.current));
        context.save();
        context.setLineDash([4, 7]);
        context.strokeStyle = "rgba(51,112,255,.25)";
        context.beginPath();
        context.moveTo(x, 53 + radius * 2);
        context.lineTo(x, Math.max(80, lineY - 10));
        context.stroke();
        context.restore();
        drawBall({ id: -1, level: currentLevelRef.current, x, y: 42 + radius, vx: 0, vy: 0, angle: 0, angularVelocity: 0, bornAt: 0 });
      }

      ballsRef.current.forEach(drawBall);
      drawMountain(width, height);
      drawParticles(delta);
    };

    const resolvePhysics = (delta: number, now: number) => {
      const { width } = dimensionsRef.current;
      const gravity = 980;
      const bottom = floorY();
      const balls = ballsRef.current;

      balls.forEach((ball) => {
        const radius = levelRadius(ball.level);
        ball.vy += gravity * delta;
        ball.vx *= Math.pow(0.995, delta * 60);
        ball.x += ball.vx * delta;
        ball.y += ball.vy * delta;
        ball.angle += ball.angularVelocity * delta;

        if (ball.x - radius < 0) {
          ball.x = radius;
          ball.vx = Math.abs(ball.vx) * 0.28;
        } else if (ball.x + radius > width) {
          ball.x = width - radius;
          ball.vx = -Math.abs(ball.vx) * 0.28;
        }
        if (ball.y + radius > bottom) {
          ball.y = bottom - radius;
          if (ball.vy > 25) ball.vy *= -0.16;
          else ball.vy = 0;
          ball.vx *= 0.965;
          ball.angularVelocity = ball.vx / Math.max(20, radius);
        }
      });

      const removed = new Set<number>();
      const additions: Ball[] = [];

      for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
        for (let firstIndex = 0; firstIndex < balls.length; firstIndex += 1) {
          const first = balls[firstIndex];
          if (removed.has(first.id)) continue;
          for (let secondIndex = firstIndex + 1; secondIndex < balls.length; secondIndex += 1) {
            const second = balls[secondIndex];
            if (removed.has(second.id)) continue;
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const radiusFirst = levelRadius(first.level);
            const radiusSecond = levelRadius(second.level);
            const minimum = radiusFirst + radiusSecond;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared >= minimum * minimum) continue;

            if (
              iteration === 0 &&
              first.level === second.level &&
              first.level < FINAL_LEVEL &&
              now - first.bornAt > 90 &&
              now - second.bornAt > 90
            ) {
              removed.add(first.id);
              removed.add(second.id);
              const mergeX = (first.x + second.x) / 2;
              const mergeY = (first.y + second.y) / 2;
              const mergeVelocityX = (first.vx + second.vx) / 2;
              const mergeVelocityY = Math.min(-70, (first.vy + second.vy) / 2 - 85);
              mergeStreakRef.current = now - lastMergeAtRef.current <= 1600 ? mergeStreakRef.current + 1 : 1;
              lastMergeAtRef.current = now;
              missedMergeDropsRef.current = 0;
              const mergeStreak = mergeStreakRef.current;

              if (first.level === DANCE_LEVEL) {
                const riseFrom = mountainRiseRef.current;
                peaksRef.current += 1;
                mountainAnimationRef.current = {
                  from: riseFrom,
                  to: targetMountainRise(peaksRef.current),
                  elapsed: 0,
                  duration: 720,
                };
                additions.push({
                  id: nextIdRef.current++,
                  level: FINAL_LEVEL,
                  x: mergeX,
                  y: mergeY,
                  vx: mergeVelocityX * 0.45,
                  vy: Math.min(-48, mergeVelocityY * 0.55),
                  angle: (first.angle + second.angle) / 2,
                  angularVelocity: (first.angularVelocity + second.angularVelocity) * 0.35,
                  bornAt: now,
                });
                setPeaks(peaksRef.current);
                syncAdjustments();
                syncScore(300 + peaksRef.current * 80);
                addParticles(mergeX, mergeY, "#f5d6a7", 14, 180);
                addParticles(mergeX, mergeY, "#22d6ff", 15, 235);
                addParticles(mergeX, mergeY, "#ff3f8e", 15, 235);
                addParticles(mergeX, mergeY, "#ffffff", 10, 195);
                showToast("OKR 完成 · 豆包登顶！", 1550);
                vibrate([35, 28, 70]);
                playTone(523, 0.12, 0, 0.045);
                playTone(659, 0.15, 0.09, 0.04);
                playTone(784, 0.22, 0.18, 0.04);
              } else {
                const newLevel = first.level + 1;
                additions.push({
                  id: nextIdRef.current++,
                  level: newLevel,
                  x: mergeX,
                  y: mergeY,
                  vx: mergeVelocityX,
                  vy: mergeVelocityY,
                  angle: (first.angle + second.angle) / 2,
                  angularVelocity: (first.angularVelocity + second.angularVelocity) / 2,
                  bornAt: now,
                });
                syncAdjustments();
                syncScore(LEVELS[newLevel].score);
                if (newLevel === DANCE_LEVEL) {
                  dancesRef.current += 1;
                  setDances(dancesRef.current);
                }
                const mergeMessage = getMergeToast(newLevel, mergeStreak);
                if (mergeMessage) showToast(mergeMessage, newLevel === DANCE_LEVEL ? 1250 : mergeStreak >= 2 ? 1100 : 900);
                addParticles(mergeX, mergeY, LEVELS[newLevel].color, 10, 135 + newLevel * 11);
                playTone(360 + newLevel * 72, 0.07 + newLevel * 0.012, 0, 0.025 + newLevel * 0.002);
                vibrate(newLevel >= 5 ? [18, 20, 25] : 12);
              }
              break;
            }

            resolveCircleContact(first, second, radiusFirst, radiusSecond);
            constrainBodyToBoard(first, radiusFirst, width, bottom);
            constrainBodyToBoard(second, radiusSecond, width, bottom);
          }
        }
      }

      if (removed.size > 0) {
        ballsRef.current = balls.filter((ball) => !removed.has(ball.id)).concat(additions);
      }

      const lineY = dangerY();
      const overflowing = ballsRef.current.some((ball) => {
        const radius = levelRadius(ball.level);
        return now - ball.bornAt > 1350 && ball.y - radius < lineY;
      });

      if (overflowing) {
        dangerElapsedRef.current += delta * 1000;
        const progress = Math.min(100, (dangerElapsedRef.current / DANGER_DURATION) * 100);
        if (now - lastDangerUiRef.current > 80) {
          lastDangerUiRef.current = now;
          dangerProgressRef.current = progress;
          setDangerProgress(progress);
        }
        if (progress >= 100) endGame();
      } else if (dangerElapsedRef.current > 0) {
        dangerElapsedRef.current = 0;
        dangerProgressRef.current = 0;
        setDangerProgress(0);
      }
    };

    const updateMountainAnimation = (delta: number) => {
      const animation = mountainAnimationRef.current;
      if (!animation) return;
      animation.elapsed = Math.min(animation.duration, animation.elapsed + delta * 1000);
      const progress = animation.elapsed / animation.duration;
      const eased = 1 - Math.pow(1 - progress, 3);
      mountainRiseRef.current = animation.from + (animation.to - animation.from) * eased;
      if (progress >= 1) {
        mountainRiseRef.current = animation.to;
        mountainAnimationRef.current = null;
      }
    };

    const frame = (now: number) => {
      if (pausedRef.current && now - lastFrameRef.current < 120) {
        animationRef.current = requestAnimationFrame(frame);
        return;
      }
      const previous = lastFrameRef.current || now;
      const elapsed = Math.min(0.033, Math.max(0.001, (now - previous) / 1000));
      lastFrameRef.current = now;
      if (!pausedRef.current) {
        updateMountainAnimation(elapsed);
        const steps = getPhysicsSubsteps(ballsRef.current, elapsed, levelRadius);
        for (let index = 0; index < steps; index += 1) resolvePhysics(elapsed / steps, now);
      }
      drawScene(pausedRef.current ? 0 : elapsed);
      animationRef.current = requestAnimationFrame(frame);
    };

    animationRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [addParticles, dangerY, endGame, floorY, levelRadius, playTone, showToast, syncAdjustments, syncScore, targetMountainRise, vibrate]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    writeLocalValue("doubao-dance-sound", soundEnabled ? "on" : "off");
  }, [soundEnabled]);

  useEffect(() => {
    vibrationEnabledRef.current = vibrationEnabled;
    writeLocalValue("doubao-dance-vibration", vibrationEnabled ? "on" : "off");
  }, [vibrationEnabled]);

  useEffect(() => {
    const restorePage = () => {
      lastFrameRef.current = performance.now();
      setShareState("idle");
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) restorePage();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", restorePage);
    window.addEventListener("pageshow", restorePage);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", restorePage);
      window.removeEventListener("pageshow", restorePage);
    };
  }, []);

  const saveUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUsername = normalizeUsername(usernameDraft);
    if (!isValidAlias(nextUsername)) {
      setUsernameError("花名需为 2–3 个汉字");
      return;
    }
    setUsernameSaving(true);
    const result = await claimAlias(playerIdRef.current, nextUsername);
    setUsernameSaving(false);
    if (!result.ok && result.status !== 0) {
      setUsernameError(result.error);
      return;
    }
    usernameRef.current = nextUsername;
    setUsername(nextUsername);
    setUsernameDraft(nextUsername);
    setUsernameError("");
    writeLocalValue("doubao-dance-username", nextUsername);
    if (result.status === 0) showToast("已离线进入，联网后自动同步排行榜", 1800);
    lastFrameRef.current = performance.now();
    pausedRef.current = false;
  };

  const openLeaderboard = () => {
    pausedRef.current = true;
    setLeaderboardOpen(true);
    void loadLeaderboard();
  };

  const closeLeaderboard = () => {
    setLeaderboardOpen(false);
    if (!gameOverRef.current && usernameRef.current) {
      lastFrameRef.current = performance.now();
      pausedRef.current = false;
    }
  };

  const openSettings = () => {
    pausedRef.current = true;
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    if (!gameOverRef.current && usernameRef.current) {
      lastFrameRef.current = performance.now();
      pausedRef.current = false;
    }
  };

  const finishCurrentYear = () => {
    setSettingsOpen(false);
    pausedRef.current = false;
    endGame();
  };

  const shareSummary = async () => {
    const rating = getPerformanceRating(score, peaks);
    const gameUrl = gameShareUrl();
    const text = `我的合成大豆包年度总结：获得 ${formatNumber(score)} 字节范儿，经历 ${adjustments} 次组织架构调整，攀登 ${peaks} 座高峰，绩效 ${rating}。${getPerformanceSummary(score, peaks)}！扫码或打开 ${gameUrl}`;
    setShareState("creating");
    try {
      const qrDataUrl = await QRCode.toDataURL(gameUrl, {
        width: 260,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#10183A", light: "#FFFFFF" },
      });
      const loadImage = (src: string, message: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(message));
        image.src = src;
      });
      const [qrImage, bunImage] = await Promise.all([
        loadImage(qrDataUrl, "二维码生成失败"),
        loadImage(publicAsset("/icons/level-08-real-doubao.png"), "豆包图标加载失败"),
      ]);

      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1440;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("分享图片生成失败");

      const background = context.createLinearGradient(0, 0, 1080, 1440);
      background.addColorStop(0, "#FBFCFF");
      background.addColorStop(0.6, "#F3F7FF");
      background.addColorStop(1, "#EEF2FF");
      context.fillStyle = background;
      context.fillRect(0, 0, 1080, 1440);
      context.strokeStyle = "rgba(51,112,255,.065)";
      context.lineWidth = 2;
      for (let position = 0; position <= 1080; position += 54) {
        context.beginPath();
        context.moveTo(position, 0);
        context.lineTo(position, 1440);
        context.stroke();
      }
      for (let position = 0; position <= 1440; position += 54) {
        context.beginPath();
        context.moveTo(0, position);
        context.lineTo(1080, position);
        context.stroke();
      }

      const card = (x: number, y: number, width: number, height: number, radius: number, fill: string) => {
        context.beginPath();
        context.roundRect(x, y, width, height, radius);
        context.fillStyle = fill;
        context.fill();
      };

      context.drawImage(bunImage, 65, 47, 96, 96);
      context.fillStyle = "#3370FF";
      context.font = "800 22px Inter, PingFang SC, sans-serif";
      context.fillText("ORGANIZATION LAB", 178, 84);
      context.fillStyle = "#10183A";
      context.font = "900 38px Inter, PingFang SC, sans-serif";
      context.fillText("合成大豆包", 178, 128);
      context.textAlign = "right";
      context.fillStyle = "#60709B";
      context.font = "750 25px Inter, PingFang SC, sans-serif";
      context.fillText(`@${usernameRef.current}`, 1004, 99);
      context.textAlign = "left";

      card(58, 174, 964, 746, 44, "rgba(255,255,255,.91)");
      context.textAlign = "center";
      context.fillStyle = "#3370FF";
      context.font = "850 20px Inter, PingFang SC, sans-serif";
      context.fillText("YOUR ANNUAL REVIEW", 540, 236);
      context.fillStyle = "#10183A";
      context.font = "900 51px Inter, PingFang SC, sans-serif";
      context.fillText("本年度调整已完成", 540, 304);
      context.fillStyle = "#707997";
      context.font = "600 22px Inter, PingFang SC, sans-serif";
      context.fillText("本年度累计获得", 540, 365);
      context.fillStyle = "#10183A";
      context.font = "900 142px Inter, PingFang SC, sans-serif";
      context.fillText(formatNumber(score), 540, 506);
      context.fillStyle = "#3370FF";
      context.font = "850 25px Inter, PingFang SC, sans-serif";
      context.fillText("字节范儿", 540, 549);

      const performanceGradient = context.createLinearGradient(324, 590, 756, 684);
      performanceGradient.addColorStop(0, "rgba(34,214,255,.16)");
      performanceGradient.addColorStop(0.5, "rgba(51,112,255,.13)");
      performanceGradient.addColorStop(1, "rgba(255,63,142,.13)");
      card(324, 582, 432, 100, 24, performanceGradient);
      context.textAlign = "left";
      context.fillStyle = "#25345F";
      context.font = "800 24px Inter, PingFang SC, sans-serif";
      context.fillText("年度绩效", 367, 643);
      context.textAlign = "right";
      context.fillStyle = "#3370FF";
      context.font = "900 52px Inter, PingFang SC, sans-serif";
      context.fillText(rating, 712, 649);

      const stats = [
        ["组织调整", adjustments, "次"],
        ["豆包 Dance", dances, "次"],
        ["勇攀高峰", peaks, "座"],
      ] as const;
      stats.forEach(([label, value, unit], index) => {
        const x = 96 + index * 304;
        card(x, 724, 280, 126, 24, "#F7F9FF");
        context.textAlign = "center";
        context.fillStyle = "#707997";
        context.font = "650 18px Inter, PingFang SC, sans-serif";
        context.fillText(label, x + 140, 762);
        context.fillStyle = "#10183A";
        context.font = "900 44px Inter, PingFang SC, sans-serif";
        context.fillText(`${value} ${unit}`, x + 140, 821);
      });
      context.textAlign = "center";
      context.fillStyle = "#25345F";
      context.font = "850 25px Inter, PingFang SC, sans-serif";
      context.fillText(getPerformanceSummary(score, peaks), 540, 890);

      const mountain = context.createLinearGradient(0, 990, 1080, 1370);
      mountain.addColorStop(0, "#22D6FF");
      mountain.addColorStop(0.48, "#3370FF");
      mountain.addColorStop(1, "#FF3F8E");
      context.beginPath();
      context.moveTo(0, 1350);
      context.lineTo(0, 1215);
      context.lineTo(225, 1100);
      context.lineTo(380, 1164);
      context.lineTo(620, 1018);
      context.lineTo(815, 1134);
      context.lineTo(1080, 990);
      context.lineTo(1080, 1440);
      context.closePath();
      context.fillStyle = mountain;
      context.fill();

      card(58, 958, 964, 404, 42, "rgba(16,24,58,.93)");
      card(92, 998, 312, 312, 30, "#FFFFFF");
      context.drawImage(qrImage, 118, 1024, 260, 260);
      context.textAlign = "left";
      context.fillStyle = "#22D6FF";
      context.font = "850 21px Inter, PingFang SC, sans-serif";
      context.fillText("SCAN TO PLAY", 454, 1052);
      context.fillStyle = "#FFFFFF";
      context.font = "900 43px Inter, PingFang SC, sans-serif";
      context.fillText("扫码加入合成大豆包", 454, 1120);
      context.fillStyle = "rgba(255,255,255,.72)";
      context.font = "650 22px Inter, PingFang SC, sans-serif";
      context.fillText("两个相同图标碰撞，合成你的字节范儿", 454, 1170);
      if (myRank) {
        card(454, 1210, 278, 62, 18, "rgba(51,112,255,.38)");
        context.fillStyle = "#FFFFFF";
        context.font = "850 25px Inter, PingFang SC, sans-serif";
        context.fillText(`当前全服第 ${myRank} 名`, 484, 1251);
      }
      context.fillStyle = "rgba(255,255,255,.54)";
      context.font = "550 17px Inter, PingFang SC, sans-serif";
      context.fillText(new URL(gameUrl).host, 454, 1312);

      const previewUrl = canvas.toDataURL("image/png");
      const filename = `合成大豆包-${usernameRef.current}-年度总结.png`;
      let file: File | null = null;
      if (typeof File === "function" && typeof canvas.toBlob === "function") {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) file = new File([blob], filename, { type: "image/png" });
      }
      canvas.width = 1;
      canvas.height = 1;
      shareFileRef.current = file;
      shareFilenameRef.current = filename;
      shareTextRef.current = text;
      setSharePreviewUrl(previewUrl);
      setShareHint("微信内请长按图片保存，再发送给好友或朋友圈");
      setShareState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setShareState("idle");
        return;
      }
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 2200);
    }
  };

  const trackShare = useCallback((channel: ShareChannel) => {
    void postAnalytics({ eventType: "share", eventId: createTrackingId("share"), channel });
  }, [postAnalytics]);

  const openInviteShare = async () => {
    pausedRef.current = true;
    setInviteShareOpen(true);
    setInviteShareHint("扫码或转发链接，邀请同事来一局");
    if (inviteQrUrl) return;
    try {
      const qrDataUrl = await QRCode.toDataURL(gameShareUrl(), {
        width: 420,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#10183A", light: "#FFFFFF" },
      });
      setInviteQrUrl(qrDataUrl);
    } catch {
      setInviteShareHint("二维码生成失败，请重试或直接复制链接");
    }
  };

  const closeInviteShare = () => {
    setInviteShareOpen(false);
    if (!gameOverRef.current && usernameRef.current) {
      lastFrameRef.current = performance.now();
      pausedRef.current = false;
    }
  };

  const nativeShareInvite = async () => {
    if (!navigator.share) {
      setInviteShareHint("当前浏览器不支持系统分享，请复制链接发送");
      return;
    }
    try {
      await navigator.share({ title: "合成大豆包", text: INVITE_SHARE_COPY, url: gameShareUrl() });
      trackShare("system_share");
      setInviteShareHint("分享面板已打开，发送后回来继续合成");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setInviteShareHint("系统分享未完成，请复制链接发送");
      }
    } finally {
      lastFrameRef.current = performance.now();
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(`${INVITE_SHARE_COPY}\n${gameShareUrl()}`);
      trackShare("copy_link");
      setInviteShareHint("文案和游戏链接已复制");
    } catch {
      setInviteShareHint("复制失败，可让同事直接扫描二维码");
    }
  };

  const selectWechatChannel = (channel: "wechat_friend" | "wechat_moments") => {
    trackShare(channel);
    setShareHint(channel === "wechat_friend"
      ? "已记录微信好友渠道：长按上方图片保存，再发送给好友"
      : "已记录朋友圈渠道：长按上方图片保存，再发布到朋友圈");
  };

  const downloadShareImage = () => {
    if (!sharePreviewUrl) return;
    const download = document.createElement("a");
    download.href = sharePreviewUrl;
    download.download = shareFilenameRef.current;
    document.body.appendChild(download);
    download.click();
    download.remove();
    trackShare("download");
    setShareHint("图片已触发下载；微信内若未响应，请直接长按上方图片保存");
  };

  const nativeShareSummary = async () => {
    const file = shareFileRef.current;
    if (!file || !navigator.share || !navigator.canShare?.({ files: [file] })) {
      setShareHint("当前浏览器不支持直接分享文件，请长按图片保存后发送");
      return;
    }
    try {
      await navigator.share({ title: "合成大豆包年度总结", text: shareTextRef.current, files: [file] });
      trackShare("system_share");
      setShareHint("系统分享已完成");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareHint("系统分享未完成，请长按图片保存后发送");
      }
    } finally {
      lastFrameRef.current = performance.now();
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareTextRef.current}\n${gameShareUrl()}`);
      trackShare("copy_link");
      setShareHint("链接和年度总结已复制");
    } catch {
      setShareHint("复制失败，请长按图片保存后发送");
    }
  };

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-mark" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicAsset("/icons/level-08-real-doubao.png")} alt="" />
        </div>
        <div className="title-group">
          <p className="eyebrow">ORGANIZATION LAB</p>
          <h1>合成大豆包</h1>
          <p className="subtitle">{username ? `@${username} · 让组织碰撞起来？` : "让组织碰撞起来？"}</p>
        </div>
        <div className="header-actions">
          <button className="share-button" type="button" onClick={() => void openInviteShare()} aria-label="分享游戏">
            <b>享</b><span>分享</span>
          </button>
          <button className="rank-button" type="button" onClick={openLeaderboard} aria-label="查看排行榜">
            <b>榜</b><span>排行</span>
          </button>
          <button className="icon-button" type="button" onClick={openSettings} aria-label="打开游戏设置">
            <span /><span /><span />
          </button>
        </div>
      </header>

      <section className="score-row" aria-label="本局数据">
        <div className="score-card score-main">
          <span>字节范儿</span>
          <strong>{formatNumber(score)}</strong>
        </div>
        <div className="score-card">
          <span>组织调整</span>
          <strong>{adjustments}</strong>
        </div>
        <div className="score-card">
          <span>勇攀高峰</span>
          <strong>{peaks}</strong>
        </div>
      </section>

      <section className="play-layout">
        <div className="next-card" aria-label={`下一个图标：${LEVELS[nextLevel].name}`}>
          <span>下一个</span>
          <LevelBadge levelIndex={nextLevel} compact />
        </div>
        <div className="best-chip">最高 {formatNumber(bestScore)}</div>

        <div
          ref={boardRef}
          className={`game-board${dangerProgress > 0 ? " is-danger" : ""}`}
          style={{ "--danger-progress": `${dangerProgress}%` } as CSSProperties}
        >
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="button"
            aria-label="游戏容器。移动指针选择位置，点击投放；键盘左右键移动，空格投放。"
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={(event) => {
              if (activePointerIdRef.current === event.pointerId) activePointerIdRef.current = null;
            }}
            onLostPointerCapture={(event) => {
              if (activePointerIdRef.current === event.pointerId) activePointerIdRef.current = null;
            }}
            onKeyDown={handleKeyDown}
          />

          {!started && !gameOver && (
            <div className="onboarding" aria-hidden="true">
              <span className="tap-orbit"><i /></span>
              <strong>拖动位置，松手投放</strong>
              <span>两个相同图标碰撞，即可完成一次调整</span>
            </div>
          )}

          {toast && <div className="merge-toast" role="status">{toast}</div>}
          {dangerProgress > 0 && <div className="danger-meter"><i /></div>}
        </div>
      </section>

      <section className="level-strip" aria-label="合成路径">
        {LEVELS.map((level, index) => (
          <div className="level-step" key={level.key}>
            <LevelBadge levelIndex={index} />
            {index < LEVELS.length - 1 && <span aria-hidden="true">›</span>}
          </div>
        ))}
      </section>

      <div className="game-footer">
        <p>两个 Doubao Dance 相遇后合成大豆包，高峰升起，空间缩小</p>
        <span>持续越过警戒线 2.5 秒，本年度结束</span>
      </div>

      {profileReady && !username && (
        <div className="modal-backdrop username-backdrop">
          <form className="modal username-modal" onSubmit={saveUsername} aria-labelledby="username-title">
            <div className="name-orbit" aria-hidden="true"><i>榜</i></div>
            <p className="summary-kicker">WELCOME TO THE LAB</p>
            <h2 id="username-title">先取一个花名</h2>
            <p className="username-intro">2–3 个汉字、积极得体、全服不重名。</p>
            <label htmlFor="username-input">花名</label>
            <input
              id="username-input"
              value={usernameDraft}
              onChange={(event) => {
                setUsernameDraft(event.target.value);
                if (usernameError) setUsernameError("");
              }}
              maxLength={3}
              placeholder="输入 2–3 个汉字"
              autoComplete="nickname"
              disabled={usernameSaving}
            />
            <div className="username-meta">
              <span className={usernameError ? "is-error" : ""}>{usernameError || "武侠人物只是传统，不作强制"}</span>
              <b>{Array.from(usernameDraft).length}/3</b>
            </div>
            <button className="primary-button username-submit" type="submit" disabled={usernameSaving}>{usernameSaving ? "正在查重…" : "以此花名入职"}</button>
          </form>
        </div>
      )}

      {leaderboardOpen && (
        <div className="modal-backdrop leaderboard-backdrop" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeLeaderboard();
        }}>
          <section className="modal leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
            <div className="modal-heading leaderboard-heading">
              <div>
                <p className="eyebrow">BYTE STYLE RANKING</p>
                <h2 id="leaderboard-title">字节范儿排行榜</h2>
                <p>按个人历史最高分排名 · TOP 50</p>
              </div>
              <button className="close-button" type="button" onClick={closeLeaderboard} aria-label="关闭排行榜">×</button>
            </div>

            {leaderboardLoading && <div className="leaderboard-state">正在同步组织战绩…</div>}
            {!leaderboardLoading && leaderboardNotice && <p className="leaderboard-notice">{leaderboardNotice}</p>}
            {!leaderboardLoading && leaderboardError && (
              <div className="leaderboard-state is-error">
                <span>{leaderboardError}</span>
                <button className="secondary-button" type="button" onClick={() => void loadLeaderboard()}>重新加载</button>
              </div>
            )}
            {!leaderboardLoading && !leaderboardError && leaderboardEntries.length === 0 && (
              <div className="leaderboard-state">还没有人完成年度总结，第一名等你来拿。</div>
            )}
            {!leaderboardLoading && !leaderboardError && leaderboardEntries.length > 0 && (
              <ol className="leaderboard-list">
                {leaderboardEntries.map((entry) => (
                  <li key={`${entry.rank}-${entry.username}`} className={entry.username === username ? "is-me" : ""}>
                    <span className={`rank-number rank-${entry.rank}`}>{entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}</span>
                    <span className="leaderboard-user">
                      <b>{entry.username}{entry.username === username ? " · 我" : ""}</b>
                      <small>{entry.peaks} 座高峰 · {entry.adjustments} 次调整</small>
                    </span>
                    <span className="leaderboard-score"><b>{formatNumber(entry.score)}</b><small>字节范儿</small></span>
                    <span className="rating-pill">{entry.rating}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {inviteShareOpen && (
        <div className="modal-backdrop invite-share-backdrop" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeInviteShare();
        }}>
          <section className="modal invite-share-modal" role="dialog" aria-modal="true" aria-labelledby="invite-share-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SHARE THE FUN</p>
                <h2 id="invite-share-title">扫码加入合成大豆包</h2>
              </div>
              <button className="close-button" type="button" onClick={closeInviteShare} aria-label="关闭分享界面">×</button>
            </div>
            <div className="invite-share-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicAsset("/icons/level-08-real-doubao.png")} alt="合成大豆包" />
              <div><b>合成大豆包</b><span>@{username} 邀你来一局</span></div>
            </div>
            <p className="invite-share-copy">{INVITE_SHARE_COPY}</p>
            <div className="invite-qr-card">
              {inviteQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inviteQrUrl} alt="合成大豆包游戏二维码" />
              ) : (
                <div className="invite-qr-loading">正在生成二维码…</div>
              )}
              <strong>微信扫一扫，直接开玩</strong>
              <span>无需下载 · 手机电脑都能玩</span>
            </div>
            <p className="share-preview-hint" role="status">{inviteShareHint}</p>
            <div className="invite-share-actions">
              <button className="secondary-button" type="button" onClick={() => void copyInviteLink()}>复制文案和链接</button>
              <button className="primary-button" type="button" onClick={() => void nativeShareInvite()}>系统分享</button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeSettings();
        }}>
          <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">GAME SETTINGS</p>
                <h2 id="settings-title">调整说明</h2>
              </div>
              <button className="close-button" type="button" onClick={closeSettings} aria-label="关闭设置">×</button>
            </div>

            <ol className="rules-list">
              <li><b>01</b><span>移动投放位置，松手让图标落下。</span></li>
              <li><b>02</b><span>两个相同图标碰撞，合成下一级。</span></li>
              <li><b>03</b><span>两个 Doubao Dance 合成大豆包，并升起一座高峰。</span></li>
              <li><b>04</b><span>图标持续越过警戒线，本年度调整结束。</span></li>
            </ol>

            <div className="setting-row">
              <span><b>声音反馈</b><small>合成与高峰提示音</small></span>
              <button className={`switch${soundEnabled ? " is-on" : ""}`} type="button" onClick={() => setSoundEnabled((value) => !value)} aria-pressed={soundEnabled}><i /></button>
            </div>
            <div className="setting-row">
              <span><b>触感反馈</b><small>支持的移动设备生效</small></span>
              <button className={`switch${vibrationEnabled ? " is-on" : ""}`} type="button" onClick={() => setVibrationEnabled((value) => !value)} aria-pressed={vibrationEnabled}><i /></button>
            </div>

            <div className="modal-actions">
              {started && <button className="secondary-button" type="button" onClick={finishCurrentYear}>生成阶段总结</button>}
              <button className="primary-button" type="button" onClick={closeSettings}>继续调整</button>
            </div>
          </section>
        </div>
      )}

      {gameOver && !leaderboardOpen && !inviteShareOpen && (
        <div className="modal-backdrop summary-backdrop">
          <section className="modal summary-card" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <div className="summary-ribbons" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <p className="summary-kicker">YOUR ANNUAL REVIEW</p>
            <h2 id="summary-title">本年度调整已完成</h2>
            <p className="summary-lead">本年度累计获得</p>
            <strong className="summary-score">{formatNumber(score)}</strong>
            <span className="summary-unit">字节范儿</span>

            <div className="performance-result">
              <span>年度绩效</span>
              <strong>{getPerformanceRating(score, peaks)}</strong>
              <small>3000 以下或 0 峰为 I · 2 峰 M+ · 3 峰 E</small>
            </div>

            <div className="summary-grid">
              <div><span>经历了</span><strong>{adjustments}</strong><small>次组织架构调整</small></div>
              <div><span>见证了</span><strong>{dances}</strong><small>次豆包 Dance</small></div>
              <div><span>攀登了</span><strong>{peaks}</strong><small>座高峰</small></div>
            </div>

            <blockquote>{getPerformanceSummary(score, peaks)}</blockquote>
            <p className="best-line">历史最佳：{formatNumber(Math.max(bestScore, score))} 字节范儿 · {Math.max(bestPeaks, peaks)} 座高峰</p>

            <div className={`rank-result is-${scoreSyncState}`} role="status">
              {scoreSyncState === "saving" && "正在同步全服排名…"}
              {scoreSyncState === "saved" && myRank && <>本次更新后位列 <strong>全服第 {myRank} 名</strong></>}
              {scoreSyncState === "saved" && !myRank && "成绩已计入排行榜"}
              {scoreSyncState === "error" && "成绩暂未同步，可稍后重新挑战"}
              {scoreSyncState === "idle" && "准备同步全服排名"}
            </div>

            <div className="modal-actions summary-actions">
              <button className="ranking-cta" type="button" onClick={openLeaderboard}>查看字节范儿排行榜</button>
              <button className="secondary-button" type="button" onClick={shareSummary} disabled={shareState === "creating"}>
                {shareState === "creating" ? "正在生成图片…" : shareState === "error" ? "生成失败，请重试" : "生成分享图片"}
              </button>
              <button className="primary-button" type="button" onClick={resetGame}>开启下一年度</button>
            </div>
            <p className="share-hint">分享图包含本局成绩和游戏二维码，扫码即可游玩</p>
          </section>
        </div>
      )}

      {sharePreviewUrl && (
        <div className="modal-backdrop share-preview-backdrop" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setSharePreviewUrl("");
        }}>
          <section className="modal share-preview-modal" role="dialog" aria-modal="true" aria-labelledby="share-preview-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SHARE ANNUAL REVIEW</p>
                <h2 id="share-preview-title">分享年度总结</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setSharePreviewUrl("")} aria-label="关闭分享图片">×</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="share-preview-image" src={sharePreviewUrl} alt="合成大豆包年度总结分享图" />
            <p className="share-preview-hint" role="status">{shareHint}</p>
            <div className="share-channel-actions">
              <button type="button" onClick={() => selectWechatChannel("wechat_friend")}>微信好友</button>
              <button type="button" onClick={() => selectWechatChannel("wechat_moments")}>朋友圈</button>
              <button type="button" onClick={() => void nativeShareSummary()}>系统分享</button>
              <button type="button" onClick={downloadShareImage}>下载原图</button>
              <button type="button" onClick={() => void copyShareLink()}>复制链接</button>
            </div>
            <p className="analytics-note">微信网页无法确认最终是否发送成功，请发送后回到本页面。</p>
          </section>
        </div>
      )}
    </main>
  );
}
