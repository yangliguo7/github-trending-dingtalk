# GitHub Trending DingTalk Digest Implementation Plan

## Requirements Summary

- Run entirely on GitHub Actions with no paid service.
- Capture Daily Trending Top 10 Monday through Thursday at 23:50 Asia/Shanghai.
- Publish the prior snapshot Tuesday through Friday at 09:00 Asia/Shanghai.
- Publish GitHub's rolling Weekly Trending Top 25 every Monday at 09:00 Asia/Shanghai.
- Send one compact DingTalk Markdown message per digest.
- Use GitHub Models when available and deterministic summaries otherwise.
- Cache validated analyses and never expose secrets or give repository content tool access.

Source of truth: `docs/superpowers/specs/2026-07-28-github-trending-dingtalk-design.md`.

## Acceptance Criteria

- Live Daily HTML parsing yields at least 10 ordered repositories.
- Live Weekly HTML parsing yields at least 25 ordered repositories.
- A representative repository is enriched through GitHub REST without cloning it.
- Daily Top 10 and Weekly Top 25 render below 18,000 UTF-8 bytes each.
- Missing model and DingTalk credentials complete a dry run successfully.
- Scheduled weekday routing matches the approved Asia/Shanghai behavior.
- Unit tests cover parsing, validation, fallback, caching, rendering, signatures, and routing.

## Implementation Steps

1. Create the Node.js package and repository skeleton.
   - Files: `package.json`, `.gitignore`, `README.md`, `data/cache.json`, `data/snapshots/.gitkeep`.
   - Verify: dependency install succeeds and `npm test` starts.

2. Implement external data collection and enrichment.
   - Files: `src/http.js`, `src/collect-trending.js`, `src/enrich-github.js`.
   - Parse GitHub HTML with Cheerio and enrich through authenticated GitHub REST.
   - Verify: fixture tests plus live Top 10/Top 25 and one live enrichment.

3. Implement bounded AI analysis and deterministic fallback.
   - File: `src/analyze.js`.
   - Add untrusted-input prompt isolation, batch size three, Zod validation, one repair attempt, and cache lookup/update.
   - Verify: valid model JSON, invalid JSON fallback, prompt-injection input, and cache invalidation tests.

4. Implement compact rendering and DingTalk delivery.
   - Files: `src/render.js`, `src/send-dingtalk.js`.
   - Enforce the 18,000-byte budget and signed webhook generation.
   - Verify: Top 10/Top 25 size tests and a fixed HMAC signature test vector.

5. Implement orchestration and state persistence.
   - File: `src/main.js`.
   - Support `collect-daily`, `publish-auto`, and `dry-run` commands, Asia/Shanghai dates, snapshot fallback, artifacts, and safe no-secret behavior.
   - Verify: Monday/weekdays/weekend routing and end-to-end dry runs.

6. Add GitHub Actions scheduling and state commits.
   - File: `.github/workflows/digest.yml`.
   - Configure UTC cron schedules, minimal permissions, concurrency, workflow dispatch, dependency caching, and conditional state commits.
   - Verify: YAML parses and command branches match both cron strings.

7. Run quality gates and live feasibility validation.
   - Run `npm test`, `npm run lint`, Daily dry-run, Weekly dry-run, `git diff --check`, and offline AI code review when available.
   - Stop only when all local gates pass or an external credential requirement is isolated and documented.

## Risks And Mitigations

- GitHub changes Trending HTML: selector fallbacks, fixture tests, and GitHub Search fallback.
- GitHub Models quota/model changes: configurable model and deterministic fallback.
- Repository prompt injection: system isolation, no tools, bounded input, strict output validation.
- DingTalk message overflow: deterministic compression before sending.
- GitHub Actions cron delay: label snapshots by Asia/Shanghai date, not exact minute.
- Concurrent state writes: one workflow concurrency group and no-op commits.

## Verification Steps

```text
npm test
npm run lint
npm run dry-run:daily
npm run dry-run:weekly
git diff --check
```

Live delivery is not attempted without explicit DingTalk Secrets. GitHub Models is optional during feasibility validation; its absence must exercise the documented fallback.
