import { createHmac } from "node:crypto";
import { request } from "./http.js";

export function createDingTalkSignature(secret, timestamp) {
  return createHmac("sha256", secret)
    .update(`${timestamp}\n${secret}`)
    .digest("base64");
}

export function createSignedWebhookUrl(webhook, secret, timestamp = Date.now()) {
  const url = new URL(webhook);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", createDingTalkSignature(secret, timestamp));
  return url.href;
}

export async function sendDingTalk(digest, options = {}) {
  if (!options.webhook || !options.secret) {
    throw new Error("DINGTALK_WEBHOOK and DINGTALK_SECRET are required for delivery");
  }

  const fetchImpl = options.fetchImpl ?? request;
  const url = createSignedWebhookUrl(options.webhook, options.secret, options.timestamp);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        title: digest.title,
        text: digest.text,
      },
      at: { isAtAll: false },
    }),
  });

  if (!response.ok) {
    throw new Error(`DingTalk request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errcode !== 0) {
    throw new Error(`DingTalk rejected the message with code ${payload.errcode}`);
  }

  return payload;
}
