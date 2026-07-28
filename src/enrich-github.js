import { request } from "./http.js";

const API_ROOT = "https://api.github.com";
const MANIFESTS = new Set(["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]);

function createHeaders(token) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "github-trending-dingtalk/0.1",
    "x-github-api-version": "2022-11-28",
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function githubJson(path, options) {
  const response = await options.fetchImpl(`${API_ROOT}${path}`, {
    headers: createHeaders(options.token),
  });

  if (!response.ok) {
    const error = new Error(`GitHub API ${path} failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function decodeContent(payload, limit) {
  if (!payload || payload.encoding !== "base64" || typeof payload.content !== "string") {
    return "";
  }

  return Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, limit);
}

async function optionalJson(path, options) {
  try {
    return await githubJson(path, options);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function readManifests(contents, options) {
  const candidates = contents.filter((item) => item.type === "file" && MANIFESTS.has(item.name));
  const manifests = {};
  let remaining = 4_000;

  for (const item of candidates) {
    if (remaining <= 0) {
      break;
    }

    const payload = await optionalJson(`/repos/${options.fullName}/contents/${encodeURIComponent(item.name)}`, options);
    const content = decodeContent(payload, remaining);
    if (content) {
      manifests[item.name] = content;
      remaining -= content.length;
    }
  }

  return manifests;
}

export async function enrichRepository(repository, options = {}) {
  const fetchImpl = options.fetchImpl ?? request;
  const requestOptions = { fetchImpl, token: options.token, fullName: repository.fullName };
  const encodedName = repository.fullName
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  try {
    const metadata = await githubJson(`/repos/${encodedName}`, requestOptions);
    const [readmeResult, releaseResult, contentsResult] = await Promise.allSettled([
      optionalJson(`/repos/${encodedName}/readme`, requestOptions),
      optionalJson(`/repos/${encodedName}/releases/latest`, requestOptions),
      optionalJson(`/repos/${encodedName}/contents`, requestOptions),
    ]);
    const readmePayload = readmeResult.status === "fulfilled" ? readmeResult.value : null;
    const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;
    const contents =
      contentsResult.status === "fulfilled" && Array.isArray(contentsResult.value)
        ? contentsResult.value
        : [];
    const manifests = await readManifests(contents, {
      ...requestOptions,
      fullName: encodedName,
    }).catch(() => ({}));

    return {
      ...repository,
      description: metadata.description || repository.description || "",
      topics: Array.isArray(metadata.topics) ? metadata.topics : [],
      language: metadata.language || repository.language || "",
      stars: metadata.stargazers_count ?? repository.stars ?? 0,
      forks: metadata.forks_count ?? 0,
      license: metadata.license?.spdx_id ?? "",
      homepage: metadata.homepage ?? "",
      defaultBranch: metadata.default_branch ?? "",
      readme: decodeContent(readmePayload, 8_000),
      readmeSha: readmePayload?.sha ?? "",
      release: release
        ? {
            name: release.name || release.tag_name || "",
            publishedAt: release.published_at ?? "",
            url: release.html_url ?? "",
          }
        : null,
      rootFiles: contents.slice(0, 100).map((item) => item.name),
      manifests,
      enrichmentError: "",
    };
  } catch (error) {
    return {
      ...repository,
      topics: [],
      forks: 0,
      license: "",
      homepage: "",
      defaultBranch: "",
      readme: "",
      readmeSha: "",
      release: null,
      rootFiles: [],
      manifests: {},
      enrichmentError: error.message,
    };
  }
}

export async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export function enrichRepositories(repositories, options = {}) {
  return mapLimit(repositories, 3, (repository) => enrichRepository(repository, options));
}
