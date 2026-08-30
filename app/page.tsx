"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

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

const LEVELS: Level[] = [
  { name: "Mira", key: "mira", color: "#20d8ff", accent: "#127cfe", radius: 19, score: 2, symbol: "✦", icon: "/icons/level-01-mira.png" },
  { name: "AIME", key: "aime", color: "#7259ff", accent: "#4b32c5", radius: 24, score: 4, symbol: "◆", icon: "/icons/level-02-aime.png" },
  { name: "Coze", key: "coze", color: "#ff4a92", accent: "#df1f70", radius: 30, score: 8, symbol: "∞", icon: "/icons/level-03-coze.png" },
  { name: "飞书", key: "feishu", color: "#3370ff", accent: "#14c9c9", radius: 38, score: 16, symbol: "◇", icon: "/icons/level-04-feishu.png" },
  { name: "豆包工作", key: "doubao-work", color: "#12bfa6", accent: "#087d87", radius: 47, score: 32, symbol: "▣", icon: "/icons/level-05-doubao-work.png" },
  { name: "豆包", key: "doubao", color: "#ff7147", accent: "#ff3f77", radius: 58, score: 64, symbol: "●", icon: "/icons/level-06-doubao.png" },
  { name: "Doubao Dance", key: "doubao-dance", color: "#18234d", accent: "#ff3f8e", radius: 70, score: 128, symbol: "≋", icon: "/icons/level-07-doubao-dance.png" },
];

const MAX_LEVEL = LEVELS.length - 1;
const DROP_COOLDOWN = 430;
const DANGER_DURATION = 2500;
const DROP_POOL = [0, 0, 0, 0, 1, 1, 2];

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

function LevelBadge({ levelIndex, compact = false }: { levelIndex: number; compact?: boolean }) {
  const level = LEVELS[levelIndex];
  const [hasImage, setHasImage] = useState(false);

  return (
    <span
      className={`level-badge${compact ? " is-compact" : ""}`}
      style={{ "--level-color": level.color, "--level-accent": level.accent } as CSSProperties}
      aria-label={level.name}
      title={level.name}
    >
      {!hasImage && <span aria-hidden="true">{level.symbol}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={hasImage ? "is-visible" : ""}
        src={level.icon}
        alt=""
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth > 4) setHasImage(true);
        }}
        onError={() => setHasImage(false)}
      />
    </span>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getSummaryLine(peaks: number) {
  if (peaks >= 6) return "你的字节范儿已经溢出了";
  if (peaks >= 4) return "高峰之上，还有高峰";
  if (peaks >= 2) return "持续突破组织边界";
  if (peaks === 1) return "完成调整，开始登山";
  return "组织仍有较大的调整空间";
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const iconsRef = useRef<Array<HTMLImageElement | null>>([]);
  const dimensionsRef = useRef({ width: 390, height: 560, dpr: 1 });
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
  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  const soundEnabledRef = useRef(true);
  const vibrationEnabledRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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
  const [summaryCopied, setSummaryCopied] = useState(false);

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

  const levelRadius = useCallback((level: number) => {
    const scale = Math.min(1.18, Math.max(0.86, dimensionsRef.current.width / 390));
    return LEVELS[level].radius * scale;
  }, []);

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
    vibrate([70, 45, 110]);
    playTone(230, 0.18, 0, 0.028);
    playTone(175, 0.28, 0.14, 0.024);
  }, [bestPeaks, bestScore, playTone, vibrate]);

  const resetGame = useCallback(() => {
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
    gameOverRef.current = false;
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
    setSummaryCopied(false);
    setToast("");
  }, []);

  const dropCurrent = useCallback(() => {
    if (pausedRef.current || gameOverRef.current) return;
    const now = performance.now();
    if (now - lastDropRef.current < DROP_COOLDOWN) return;
    const level = currentLevelRef.current;
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
    setStarted(true);
    playTone(310 + level * 35, 0.055, 0, 0.022);
    vibrate(8);
    const upcoming = nextLevelRef.current;
    const following = pickDropLevel();
    currentLevelRef.current = upcoming;
    nextLevelRef.current = following;
    setNextLevel(following);
  }, [levelRadius, playTone, vibrate]);

  const setAimFromClientX = useCallback((clientX: number) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const radius = levelRadius(currentLevelRef.current);
    aimXRef.current = Math.max(radius + 3, Math.min(rect.width - radius - 3, clientX - rect.left));
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
    const storedSound = readLocalValue("doubao-dance-sound") !== "off";
    const storedVibration = readLocalValue("doubao-dance-vibration") !== "off";
    const storedBestScore = Number(readLocalValue("doubao-dance-best-score") || 0);
    const storedBestPeaks = Number(readLocalValue("doubao-dance-best-peaks") || 0);
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
    });

    iconsRef.current = LEVELS.map((level, index) => {
      const image = new Image();
      image.onload = () => { iconsRef.current[index] = image; };
      image.onerror = () => { iconsRef.current[index] = null; };
      image.src = level.icon;
      return null;
    });

    return () => {
      window.cancelAnimationFrame(hydrationFrame);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    const canvas = canvasRef.current;
    if (!board || !canvas) return;

    const updateSize = () => {
      const rect = board.getBoundingClientRect();
      const old = dimensionsRef.current;
      const width = Math.max(280, rect.width);
      const isShortLandscape = window.innerWidth > window.innerHeight && window.innerHeight < 560;
      const height = Math.max(isShortLandscape ? 260 : 390, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.abs(old.width - width) > 1 || Math.abs(old.height - height) > 1) {
        const xScale = width / old.width;
        const yScale = height / old.height;
        ballsRef.current.forEach((ball) => {
          ball.x *= xScale;
          ball.y *= yScale;
          ball.vx *= xScale;
          ball.vy *= yScale;
        });
        aimXRef.current *= xScale;
      }
      dimensionsRef.current = { width, height, dpr };
      if (Math.abs(old.height - height) > 1 && peaksRef.current > 0) {
        mountainRiseRef.current = Math.min(height * 0.44, peaksRef.current * height * 0.1);
        mountainAnimationRef.current = null;
      }
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
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
      } else {
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
      }
      context.restore();
    };

    const drawBall = (ball: Ball) => {
      const radius = levelRadius(ball.level);
      const level = LEVELS[ball.level];
      context.save();
      context.shadowColor = "rgba(17, 27, 67, .2)";
      context.shadowBlur = Math.max(7, radius * 0.2);
      context.shadowOffsetY = Math.max(3, radius * 0.1);
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
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowColor = "transparent";
      context.lineWidth = Math.max(2, radius * 0.06);
      context.strokeStyle = "rgba(255,255,255,.84)";
      context.stroke();

      const icon = iconsRef.current[ball.level];
      if (icon && icon.complete && icon.naturalWidth > 4) {
        context.save();
        context.beginPath();
        context.arc(ball.x, ball.y, radius * 0.78, 0, Math.PI * 2);
        context.clip();
        const size = radius * 1.56;
        context.drawImage(icon, ball.x - size / 2, ball.y - size / 2, size, size);
        context.restore();
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

      const labelY = Math.min(height - 19, top + Math.max(18, Math.min(30, rise * 0.32)));
      const labelWidth = Math.min(150, width * 0.46);
      context.fillStyle = "rgba(12, 24, 59, .78)";
      context.beginPath();
      context.roundRect(width / 2 - labelWidth / 2, labelY - 15, labelWidth, 30, 15);
      context.fill();
      context.fillStyle = "white";
      context.font = `800 ${Math.min(16, width * 0.04)}px "PingFang SC", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("勇 攀 高 峰", width / 2, labelY + 1);

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

      for (let iteration = 0; iteration < 2; iteration += 1) {
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

            const distance = Math.max(0.001, Math.sqrt(distanceSquared));
            const nx = dx / distance;
            const ny = dy / distance;

            if (
              iteration === 0 &&
              first.level === second.level &&
              now - first.bornAt > 90 &&
              now - second.bornAt > 90
            ) {
              removed.add(first.id);
              removed.add(second.id);
              const mergeX = (first.x + second.x) / 2;
              const mergeY = (first.y + second.y) / 2;
              const mergeVelocityX = (first.vx + second.vx) / 2;
              const mergeVelocityY = Math.min(-70, (first.vy + second.vy) / 2 - 85);

              if (first.level === MAX_LEVEL) {
                const riseFrom = mountainRiseRef.current;
                peaksRef.current += 1;
                mountainAnimationRef.current = {
                  from: riseFrom,
                  to: targetMountainRise(peaksRef.current),
                  elapsed: 0,
                  duration: 720,
                };
                setPeaks(peaksRef.current);
                syncAdjustments();
                syncScore(300 + peaksRef.current * 80);
                addParticles(mergeX, mergeY, "#22d6ff", 15, 235);
                addParticles(mergeX, mergeY, "#ff3f8e", 15, 235);
                addParticles(mergeX, mergeY, "#ffffff", 10, 195);
                showToast("勇攀高峰！", 1450);
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
                if (newLevel === MAX_LEVEL) {
                  dancesRef.current += 1;
                  setDances(dancesRef.current);
                  showToast("豆包开始 Dance！", 1250);
                } else if (newLevel === 5) {
                  showToast("豆包登场", 900);
                } else if (newLevel === 4) {
                  showToast("开始认真工作", 900);
                } else if (newLevel === 3) {
                  showToast("协作起来了", 850);
                }
                addParticles(mergeX, mergeY, LEVELS[newLevel].color, 10, 135 + newLevel * 11);
                playTone(360 + newLevel * 72, 0.07 + newLevel * 0.012, 0, 0.025 + newLevel * 0.002);
                vibrate(newLevel >= 5 ? [18, 20, 25] : 12);
              }
              break;
            }

            const overlap = minimum - distance;
            const massFirst = radiusFirst * radiusFirst;
            const massSecond = radiusSecond * radiusSecond;
            const totalMass = massFirst + massSecond;
            first.x -= nx * overlap * (massSecond / totalMass) * 0.82;
            first.y -= ny * overlap * (massSecond / totalMass) * 0.82;
            second.x += nx * overlap * (massFirst / totalMass) * 0.82;
            second.y += ny * overlap * (massFirst / totalMass) * 0.82;

            const relativeVelocityX = second.vx - first.vx;
            const relativeVelocityY = second.vy - first.vy;
            const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;
            if (velocityAlongNormal < 0) {
              const restitution = 0.12;
              const impulse = (-(1 + restitution) * velocityAlongNormal) / (1 / massFirst + 1 / massSecond);
              const impulseX = impulse * nx;
              const impulseY = impulse * ny;
              first.vx -= impulseX / massFirst;
              first.vy -= impulseY / massFirst;
              second.vx += impulseX / massSecond;
              second.vy += impulseY / massSecond;
            }
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
        const steps = 2;
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
    const handleVisibilityChange = () => {
      if (!document.hidden) lastFrameRef.current = performance.now();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const openSettings = () => {
    pausedRef.current = true;
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    if (!gameOverRef.current) {
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
    const text = `我的组织碰撞年度总结：获得 ${formatNumber(score)} 字节范儿，经历 ${adjustments} 次组织架构调整，见证 ${dances} 次豆包 Dance，攀登 ${peaks} 座高峰。${getSummaryLine(peaks)}！`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "组织碰撞年度总结", text });
      } else {
        await navigator.clipboard.writeText(text);
        setSummaryCopied(true);
        window.setTimeout(() => setSummaryCopied(false), 1600);
      }
    } catch {
      // Cancelling the native share sheet is not an error for the player.
    }
  };

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div className="title-group">
          <p className="eyebrow">ORGANIZATION LAB</p>
          <h1>组织碰撞实验</h1>
          <p className="subtitle">让灵感碰撞起来</p>
        </div>
        <button className="icon-button" type="button" onClick={openSettings} aria-label="打开游戏设置">
          <span /><span /><span />
        </button>
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
        <p>两个最高级图标相遇后消失，高峰升起，空间缩小</p>
        <span>图标槽位已预留</span>
      </div>

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
              <li><b>03</b><span>两个 Doubao Dance 消失，并升起一座高峰。</span></li>
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

      {gameOver && (
        <div className="modal-backdrop summary-backdrop">
          <section className="modal summary-card" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <div className="summary-ribbons" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <p className="summary-kicker">YOUR ANNUAL REVIEW</p>
            <h2 id="summary-title">本年度调整已完成</h2>
            <p className="summary-lead">本年度累计获得</p>
            <strong className="summary-score">{formatNumber(score)}</strong>
            <span className="summary-unit">字节范儿</span>

            <div className="summary-grid">
              <div><span>经历了</span><strong>{adjustments}</strong><small>次组织架构调整</small></div>
              <div><span>见证了</span><strong>{dances}</strong><small>次豆包 Dance</small></div>
              <div><span>攀登了</span><strong>{peaks}</strong><small>座高峰</small></div>
            </div>

            <blockquote>{getSummaryLine(peaks)}</blockquote>
            <p className="best-line">历史最佳：{formatNumber(Math.max(bestScore, score))} 字节范儿 · {Math.max(bestPeaks, peaks)} 座高峰</p>

            <div className="modal-actions summary-actions">
              <button className="secondary-button" type="button" onClick={shareSummary}>{summaryCopied ? "已复制" : "分享年度总结"}</button>
              <button className="primary-button" type="button" onClick={resetGame}>开启下一年度</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
