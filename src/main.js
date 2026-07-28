import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeRepositories } from "./analyze.js";
import { fetchSearchFallback, fetchTrending } from "./collect-trending.js";
import { enrichRepositories } from "./enrich-github.js";
import { renderDigest } from "./render.js";
import { sendDingTalk } from "./send-dingtalk.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_PATH = path.join(ROOT, "data", "cache.json");
const SNAPSHOT_DIR = path.join(ROOT, "data", "snapshots");
const ARTIFACT_DIR = path.join(ROOT, ".artifacts");
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;

export function shanghaiDateKey(now = new Date(), dayOffset = 0) {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS + dayOffset * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

export function shanghaiWeekday(now = new Date()) {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS).getUTCDay();
}

export function routeForPublish(now = new Date()) {
  const weekday = shanghaiWeekday(now);
  if (weekday === 1) return "weekly";
  if (weekday >= 2 && weekday <= 5) return "daily";
  return "none";
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

async function getRanking(period, limit, token) {
  try {
    return {
      repositories: await fetchTrending(period, limit),
      source: "GitHub Trending",
    };
  } catch (error) {
    console.warn(`Trending unavailable: ${error.message}. Using GitHub Search fallback.`);
    return {
      repositories: await fetchSearchFallback(limit, { token }),
      source: "GitHub Search fallback",
    };
  }
}

async function collectDaily(now = new Date()) {
  const date = shanghaiDateKey(now);
  const ranking = await getRanking("daily", 10, process.env.GITHUB_TOKEN);
  const snapshot = {
    version: 1,
    date,
    capturedAt: now.toISOString(),
    source: ranking.source,
    repositories: ranking.repositories,
  };
  const snapshotPath = path.join(SNAPSHOT_DIR, `${date}.json`);
  await writeJsonAtomic(snapshotPath, snapshot);
  console.log(`Saved Daily Top 10 snapshot: ${path.relative(ROOT, snapshotPath)}`);
  return snapshot;
}

async function loadDailyForPublish(now = new Date()) {
  const previousDate = shanghaiDateKey(now, -1);
  const snapshotPath = path.join(SNAPSHOT_DIR, `${previousDate}.json`);
  const snapshot = await readJson(snapshotPath, null);

  if (snapshot?.repositories?.length >= 10) {
    return {
      period: "daily",
      date: previousDate,
      source: snapshot.source,
      title: "GitHub 昨日趋势榜",
      repositories: snapshot.repositories.slice(0, 10),
    };
  }

  const ranking = await getRanking("daily", 10, process.env.GITHUB_TOKEN);
  return {
    period: "daily",
    date: shanghaiDateKey(now),
    source: ranking.source,
    title: "GitHub 当前日榜（昨日快照缺失）",
    repositories: ranking.repositories,
  };
}

async function loadWeeklyForPublish(now = new Date()) {
  const ranking = await getRanking("weekly", 25, process.env.GITHUB_TOKEN);
  return {
    period: "weekly",
    date: shanghaiDateKey(now),
    source: ranking.source,
    title: "GitHub 近 7 天趋势周榜",
    repositories: ranking.repositories,
  };
}

async function buildDigest(input, options = {}) {
  const enriched = await enrichRepositories(input.repositories, {
    token: process.env.GITHUB_TOKEN,
  });
  const cache = await readJson(CACHE_PATH, { version: 1, entries: {} });
  const analyzed = await analyzeRepositories(enriched, {
    token: process.env.GITHUB_TOKEN,
    model: process.env.AI_MODEL,
    endpoint: process.env.GITHUB_MODELS_ENDPOINT,
    cache,
  });
  await writeJsonAtomic(CACHE_PATH, analyzed.cache);

  const digest = renderDigest(enriched, analyzed.analyses, {
    period: input.period,
    title: input.title,
    date: input.date,
    source: input.source,
  });
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifactPath = path.join(ARTIFACT_DIR, `${input.period}-${input.date}.md`);
  await writeFile(artifactPath, `${digest.text}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(
    `Rendered ${input.repositories.length} repositories: ${path.relative(ROOT, artifactPath)} (${digest.bytes} bytes, compression ${digest.compressionLevel})`,
  );

  if (!options.dryRun) {
    await sendDingTalk(digest, {
      webhook: process.env.DINGTALK_WEBHOOK,
      secret: process.env.DINGTALK_SECRET,
    });
    console.log("DingTalk delivery succeeded.");
  }

  return { digest, artifactPath, enriched, analyses: analyzed.analyses };
}

export async function run(command, argument, now = new Date()) {
  switch (command) {
    case "collect-daily":
      return collectDaily(now);
    case "publish-auto": {
      const route = routeForPublish(now);
      if (route === "none") {
        console.log("No digest is scheduled for this Asia/Shanghai weekday.");
        return null;
      }
      const input = route === "weekly" ? await loadWeeklyForPublish(now) : await loadDailyForPublish(now);
      return buildDigest(input, { dryRun: false });
    }
    case "dry-run": {
      const period = argument === "weekly" ? "weekly" : "daily";
      const input =
        period === "weekly"
          ? await loadWeeklyForPublish(now)
          : {
              ...(await getRanking("daily", 10, process.env.GITHUB_TOKEN)),
              period: "daily",
              date: shanghaiDateKey(now),
              title: "GitHub 日榜 Dry Run",
            };
      return buildDigest(input, { dryRun: true });
    }
    default:
      throw new Error(`Unknown command: ${command || "(empty)"}`);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryUrl) {
  run(process.argv[2], process.argv[3]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
