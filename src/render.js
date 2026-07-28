export const PAYLOAD_BUDGET = 18_000;

function truncate(value, limit) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\[\]`*_>#]/g, "\\$&")
    .trim();
}

function formatStars(value) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

function renderEntry(repository, analysis, level) {
  const summaryLimit = [60, 52, 44, 34, 24][level];
  const purposeLimit = [100, 80, 60, 44, 28][level];
  const lines = [
    `### ${repository.rank}. [${repository.fullName}](${repository.url}) · ${
      escapeMarkdown(repository.language || "Unknown")
    } · ${formatStars(repository.stars)} ⭐${
      repository.starsGained ? ` · +${formatStars(repository.starsGained)}` : ""
    }`,
    "",
    `> ${escapeMarkdown(truncate(analysis.summary, summaryLimit))}`,
    "",
    `**作用**：${escapeMarkdown(truncate(analysis.purpose, purposeLimit))}`,
  ];

  if (level <= 2 && analysis.useCases.length > 0) {
    const useCases = analysis.useCases
      .slice(0, level === 0 ? 2 : 1)
      .map((item) => escapeMarkdown(truncate(item, level === 0 ? 45 : 32)))
      .join("；");
    lines.push(`**场景**：${useCases}`);
  }

  if (level <= 1 && analysis.techStack.length > 0) {
    lines.push(`**技术**：${analysis.techStack.slice(0, level === 0 ? 5 : 3).map(escapeMarkdown).join("、")}`);
  }

  if (level === 0 && analysis.caveats.length > 0) {
    lines.push(`**注意**：${escapeMarkdown(truncate(analysis.caveats[0], 60))}`);
  }

  return lines.join("\n");
}

function titleFor(period) {
  return period === "weekly" ? "GitHub 近 7 天趋势周榜" : "GitHub 昨日趋势榜";
}

function renderAtLevel(repositories, analyses, options, level) {
  const title = options.title ?? titleFor(options.period);
  const header = [
    `## ${title}`,
    "",
    `> 榜单日期：${options.date} · 来源：${options.source}`,
    "",
  ];
  const entries = repositories.map((repository, index) => renderEntry(repository, analyses[index], level));
  return `${header.join("\n")}\n${entries.join("\n\n---\n\n")}`;
}

export function renderDigest(repositories, analyses, options) {
  if (repositories.length !== analyses.length) {
    throw new Error("Repository and analysis counts do not match");
  }

  for (let level = 0; level <= 4; level += 1) {
    const text = renderAtLevel(repositories, analyses, options, level);
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes <= PAYLOAD_BUDGET) {
      return {
        title: options.title ?? titleFor(options.period),
        text,
        bytes,
        compressionLevel: level,
      };
    }
  }

  throw new Error(`Digest cannot fit within ${PAYLOAD_BUDGET} UTF-8 bytes`);
}
