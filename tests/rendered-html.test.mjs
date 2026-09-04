import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the organization merge game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>合成大豆包 · Doubao Dance<\/title>/i);
  assert.match(html, /合成大豆包/);
  assert.match(html, /让组织碰撞起来？/);
  assert.match(html, /字节范儿/);
  assert.match(html, /勇攀高峰/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps gameplay, mobile input, annual review, and final icons in source", async () => {
  const [page, layout, packageJson, iconGuide] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/icons/README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const DANGER_DURATION = 2500/);
  assert.match(page, /CONTACT_SOLVER_ITERATIONS/);
  assert.match(page, /stabilizeRestingPile/);
  assert.match(page, /first\.level === MAX_LEVEL/);
  assert.match(page, /peaksRef\.current \+= 1/);
  assert.match(page, /peakCount \* height \* 0\.1/);
  assert.match(page, /duration: 720/);
  assert.match(page, /onPointerDown=\{handlePointerDown\}/);
  assert.match(page, /onPointerUp=\{handlePointerUp\}/);
  assert.match(page, /onKeyDown=\{handleKeyDown\}/);
  assert.match(page, /本年度调整已完成/);
  assert.match(page, /年度绩效/);
  assert.match(page, /getPerformanceRating/);
  assert.match(page, /高效对齐/);
  assert.match(page, /非核心环节延后处理/);
  assert.match(page, /OKR 完成！/);
  assert.match(page, /卷起来！/);
  assert.doesNotMatch(page, /完成调整，开始登山/);
  assert.doesNotMatch(page, /见证 \$\{dances\} 次豆包 Dance/);
  assert.match(page, /context\.strokeText\("勇 攀 高 峰"/);
  assert.doesNotMatch(page, /图标槽位已预留/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(iconGuide, /level-07-doubao-dance\.png/);
  await Promise.all([
    "level-01-mira.png",
    "level-02-aime.png",
    "level-03-coze.png",
    "level-04-feishu.png",
    "level-05-doubao-work.png",
    "level-06-doubao.png",
    "level-07-doubao-dance.png",
  ].map((filename) => access(new URL(`../public/icons/${filename}`, import.meta.url))));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("keeps first-entry alias, result-card sharing, and shared leaderboard capability", async () => {
  const [page, route, schema, initialMigration, aliasMigration, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/leaderboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_stiff_medusa.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_far_carnage.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /先取一个花名/);
  assert.match(page, /2–3 个汉字、积极得体、全服不重名/);
  assert.match(page, /武侠人物只是传统，不作强制/);
  assert.match(page, /doubao-dance-username/);
  assert.match(page, /\/api\/leaderboard/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /QRCode\.toDataURL/);
  assert.match(page, /扫码加入组织碰撞实验/);
  assert.match(page, /navigator\.canShare/);
  assert.match(page, /分享图包含本局成绩和游戏二维码/);
  assert.match(page, /字节范儿排行榜/);
  assert.match(page, /全服第 \{myRank\} 名/);
  assert.match(route, /\^\[\\p\{Script=Han\}\]\{2,3\}\$/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /ON CONFLICT\(player_id\) DO UPDATE/);
  assert.match(route, /WHERE best_score > 0/);
  assert.match(route, /LIMIT 50/);
  assert.match(schema, /idx_leaderboard_ranking/);
  assert.match(schema, /idx_leaderboard_username_unique/);
  assert.match(initialMigration, /CREATE TABLE `leaderboard_entries`/);
  assert.match(initialMigration, /PRAGMA optimize/);
  assert.match(aliasMigration, /CREATE UNIQUE INDEX `idx_leaderboard_username_unique`/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});
