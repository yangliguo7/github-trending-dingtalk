import assert from "node:assert/strict";
import test from "node:test";
import { enrichRepository } from "../src/enrich-github.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("enriches repository metadata, README, root files, and manifests", async () => {
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/repos/owner/repo") {
      return jsonResponse({
        description: "Enriched description",
        topics: ["automation"],
        language: "TypeScript",
        stargazers_count: 321,
        forks_count: 12,
        license: { spdx_id: "MIT" },
        homepage: "https://example.com",
        default_branch: "main",
      });
    }
    if (pathname.endsWith("/readme")) {
      return jsonResponse({ sha: "readme-sha", encoding: "base64", content: Buffer.from("# Readme").toString("base64") });
    }
    if (pathname.endsWith("/releases/latest")) return jsonResponse({}, 404);
    if (pathname.endsWith("/contents/package.json")) {
      return jsonResponse({ encoding: "base64", content: Buffer.from('{"name":"repo"}').toString("base64") });
    }
    if (pathname.endsWith("/contents")) {
      return jsonResponse([
        { name: "README.md", type: "file" },
        { name: "package.json", type: "file" },
      ]);
    }
    return jsonResponse({}, 404);
  };

  const result = await enrichRepository(
    {
      rank: 1,
      fullName: "owner/repo",
      url: "https://github.com/owner/repo",
      description: "Trending description",
      language: "",
      stars: 10,
      starsGained: 3,
    },
    { token: "token", fetchImpl },
  );

  assert.equal(result.description, "Enriched description");
  assert.equal(result.readme, "# Readme");
  assert.equal(result.readmeSha, "readme-sha");
  assert.equal(result.manifests["package.json"], '{"name":"repo"}');
  assert.equal(result.stars, 321);
  assert.equal(result.enrichmentError, "");
});

test("metadata failure returns a usable repository fallback", async () => {
  const result = await enrichRepository(
    {
      rank: 1,
      fullName: "owner/repo",
      url: "https://github.com/owner/repo",
      description: "Trending description",
      language: "Go",
      stars: 10,
      starsGained: 3,
    },
    { fetchImpl: async () => jsonResponse({}, 403) },
  );

  assert.equal(result.description, "Trending description");
  assert.match(result.enrichmentError, /403/);
  assert.deepEqual(result.manifests, {});
});
