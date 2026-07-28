import assert from "node:assert/strict";
import test from "node:test";
import {
  createDingTalkSignature,
  createSignedWebhookUrl,
  sendDingTalk,
} from "../src/send-dingtalk.js";

test("DingTalk signature matches a fixed OpenSSL vector", () => {
  assert.equal(
    createDingTalkSignature("test-secret", 1_700_000_000_000),
    "BYMqUCZnSqbfPf1GCfZftO7Rg2g6P+Rp3/4+bLNtSGA=",
  );
});

test("signed webhook preserves access token", () => {
  const url = new URL(
    createSignedWebhookUrl(
      "https://oapi.dingtalk.com/robot/send?access_token=token",
      "test-secret",
      1_700_000_000_000,
    ),
  );
  assert.equal(url.searchParams.get("access_token"), "token");
  assert.equal(url.searchParams.get("timestamp"), "1700000000000");
  assert.equal(url.searchParams.get("sign"), "BYMqUCZnSqbfPf1GCfZftO7Rg2g6P+Rp3/4+bLNtSGA=");
});

test("delivery rejects missing credentials before network access", async () => {
  let called = false;
  await assert.rejects(
    () =>
      sendDingTalk(
        { title: "title", text: "text" },
        {
          fetchImpl: async () => {
            called = true;
          },
        },
      ),
    /required for delivery/,
  );
  assert.equal(called, false);
});

test("delivery sends one Markdown payload", async () => {
  let request;
  const response = await sendDingTalk(
    { title: "Weekly", text: "Top 25" },
    {
      webhook: "https://oapi.dingtalk.com/robot/send?access_token=token",
      secret: "test-secret",
      timestamp: 1_700_000_000_000,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(response.errcode, 0);
  assert.equal(JSON.parse(request.options.body).markdown.text, "Top 25");
  assert.match(request.url, /access_token=token/);
});
