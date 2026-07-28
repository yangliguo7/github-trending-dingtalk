import assert from "node:assert/strict";
import test from "node:test";
import { parseCount, parseTrendingHtml } from "../src/collect-trending.js";

function trendingHtml(count, period = "today") {
  const articles = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return `
      <article class="Box-row">
        <h2><a href="/owner${number}/repo${number}"> owner${number} / repo${number} </a></h2>
        <p>Repository ${number} description</p>
        <span itemprop="programmingLanguage">TypeScript</span>
        <a href="/owner${number}/repo${number}/stargazers">${number},234</a>
        <span>${number * 10} stars ${period}</span>
      </article>`;
  }).join("");
  return `<html><body>${articles}</body></html>`;
}

test("parseCount handles GitHub count formats", () => {
  assert.equal(parseCount("1,234"), 1234);
  assert.equal(parseCount("2.5k"), 2500);
  assert.equal(parseCount("3m"), 3_000_000);
  assert.equal(parseCount("unknown"), 0);
});

test("parses Daily Top 10 in displayed order", () => {
  const repositories = parseTrendingHtml(trendingHtml(12), 10);
  assert.equal(repositories.length, 10);
  assert.equal(repositories[0].fullName, "owner1/repo1");
  assert.equal(repositories[9].rank, 10);
  assert.equal(repositories[0].stars, 1234);
  assert.equal(repositories[0].starsGained, 10);
});

test("parses Weekly Top 25", () => {
  const repositories = parseTrendingHtml(trendingHtml(25, "this week"), 25);
  assert.equal(repositories.length, 25);
  assert.equal(repositories[24].fullName, "owner25/repo25");
  assert.equal(repositories[24].starsGained, 250);
});

test("rejects incomplete Trending pages", () => {
  assert.throws(() => parseTrendingHtml(trendingHtml(9), 10), /expected 10/);
});
