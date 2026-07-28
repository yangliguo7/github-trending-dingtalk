import assert from "node:assert/strict";
import test from "node:test";
import { PAYLOAD_BUDGET, renderDigest } from "../src/render.js";

function repositories(count) {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    fullName: `owner${index + 1}/repository${index + 1}`,
    url: `https://github.com/owner${index + 1}/repository${index + 1}`,
    language: "TypeScript",
    stars: 12_345 + index,
    starsGained: 100 + index,
  }));
}

function analyses(count) {
  return Array.from({ length: count }, (_, index) => ({
    repo: `owner${index + 1}/repository${index + 1}`,
    summary: "这是一个用于验证单条钉钉消息长度和自动压缩策略的项目摘要。",
    purpose: "它帮助团队把公开仓库信息整理成结构稳定、适合快速阅读的中文项目解读。",
    coreFeatures: ["结构化分析", "固定格式输出"],
    useCases: ["每日项目发现", "每周技术趋势回顾"],
    audience: ["开发者"],
    techStack: ["TypeScript", "Node.js", "GitHub Actions", "DingTalk"],
    gettingStarted: "查看 README。",
    caveats: ["自动摘要不能替代源码审查。"],
    confidence: "high",
    evidence: ["README.md"],
  }));
}

test("Daily Top 10 renders as one message", () => {
  const result = renderDigest(repositories(10), analyses(10), {
    period: "daily",
    date: "2026-07-28",
    source: "GitHub Trending",
  });
  assert.ok(result.bytes <= PAYLOAD_BUDGET);
  assert.equal((result.text.match(/^### /gm) ?? []).length, 10);
});

test("Weekly Top 25 is compressed into one message", () => {
  const result = renderDigest(repositories(25), analyses(25), {
    period: "weekly",
    date: "2026-07-28",
    source: "GitHub Trending",
  });
  assert.ok(result.bytes <= PAYLOAD_BUDGET);
  assert.equal((result.text.match(/^### /gm) ?? []).length, 25);
  assert.match(result.text, /owner25\/repository25/);
});

test("repository and analysis counts must match", () => {
  assert.throws(
    () =>
      renderDigest(repositories(2), analyses(1), {
        period: "daily",
        date: "2026-07-28",
        source: "test",
      }),
    /counts do not match/,
  );
});
