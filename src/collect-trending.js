import * as cheerio from "cheerio";
import { request } from "./http.js";

const GITHUB_ORIGIN = "https://github.com";

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseCount(value) {
  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([km])?/);
  if (!match) {
    return 0;
  }

  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function normalizeRepositoryName(text) {
  const parts = text
    .split("/")
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  const fullName = `${parts[0]}/${parts[1]}`;
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName) ? fullName : null;
}

function parseArticle($, article, rank) {
  const root = $(article);
  const repositoryLink = root.find("h2 a").first();
  const fullName = normalizeRepositoryName(repositoryLink.text());
  const href = repositoryLink.attr("href");

  if (!fullName || !href) {
    return null;
  }

  const url = new URL(href, GITHUB_ORIGIN);
  if (url.origin !== GITHUB_ORIGIN || url.pathname !== `/${fullName}`) {
    return null;
  }

  const starLink = root.find(`a[href="/${fullName}/stargazers"]`).first();
  const gainText = cleanText(
    root
      .find("span")
      .filter((_, element) => /stars?\s+(today|this week)/i.test($(element).text()))
      .first()
      .text(),
  );

  return {
    rank,
    fullName,
    url: url.href,
    description: cleanText(root.find("p").first().text()),
    language: cleanText(root.find('[itemprop="programmingLanguage"]').first().text()),
    stars: parseCount(starLink.text()),
    starsGained: parseCount(gainText),
  };
}

export function parseTrendingHtml(html, limit) {
  const $ = cheerio.load(html);
  const repositories = [];

  $("article.Box-row").each((_, article) => {
    if (repositories.length >= limit) {
      return;
    }

    const repository = parseArticle($, article, repositories.length + 1);
    if (repository) {
      repositories.push(repository);
    }
  });

  if (repositories.length < limit) {
    throw new Error(`GitHub Trending returned ${repositories.length} valid repositories; expected ${limit}`);
  }

  return repositories;
}

export async function fetchTrending(period, limit, options = {}) {
  const fetchImpl = options.fetchImpl ?? request;
  const url = `${GITHUB_ORIGIN}/trending?since=${period}`;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "github-trending-dingtalk/0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub Trending request failed with ${response.status}`);
      }

      return parseTrendingHtml(await response.text(), limit);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function fetchSearchFallback(limit, options = {}) {
  const fetchImpl = options.fetchImpl ?? request;
  const token = options.token;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    q: `created:>=${since}`,
    sort: "stars",
    order: "desc",
    per_page: String(limit),
  });
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "github-trending-dingtalk/0.1",
    "x-github-api-version": "2022-11-28",
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(`https://api.github.com/search/repositories?${query}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub Search fallback failed with ${response.status}`);
  }

  const body = await response.json();
  if (!Array.isArray(body.items) || body.items.length < limit) {
    throw new Error(`GitHub Search fallback returned fewer than ${limit} repositories`);
  }

  return body.items.slice(0, limit).map((repository, index) => ({
    rank: index + 1,
    fullName: repository.full_name,
    url: repository.html_url,
    description: repository.description ?? "",
    language: repository.language ?? "",
    stars: repository.stargazers_count ?? 0,
    starsGained: 0,
  }));
}
