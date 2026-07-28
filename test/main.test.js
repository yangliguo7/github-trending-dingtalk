import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { routeForPublish, shanghaiDateKey, shanghaiWeekday } from "../src/main.js";

test("Asia/Shanghai date crosses the UTC boundary correctly", () => {
  const now = new Date("2026-07-27T17:00:00Z");
  assert.equal(shanghaiDateKey(now), "2026-07-28");
  assert.equal(shanghaiDateKey(now, -1), "2026-07-27");
});

test("Monday routes to weekly", () => {
  const monday = new Date("2026-07-27T01:00:00Z");
  assert.equal(shanghaiWeekday(monday), 1);
  assert.equal(routeForPublish(monday), "weekly");
});

test("Tuesday through Friday route to daily", () => {
  for (const day of [28, 29, 30, 31]) {
    assert.equal(routeForPublish(new Date(`2026-07-${day}T01:00:00Z`)), "daily");
  }
});

test("weekends do not publish", () => {
  assert.equal(routeForPublish(new Date("2026-08-01T01:00:00Z")), "none");
  assert.equal(routeForPublish(new Date("2026-08-02T01:00:00Z")), "none");
});

test("workflow contains the approved UTC schedules", async () => {
  const workflow = await readFile(new URL("../.github/workflows/digest.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: "50 15 \* \* 1-4"/);
  assert.match(workflow, /cron: "0 1 \* \* 1-5"/);
  assert.match(workflow, /models: read/);
});
