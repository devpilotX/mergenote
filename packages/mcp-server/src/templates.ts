import type { PullRequest, ChangelogSection, ChangelogTemplate } from "./types.js";

// ── Noise detection ────────────────────────────────────────────────────

const BOT_PATTERNS = [/release-bot$/i, /\[bot\]$/i, /^dependabot$/i, /^renovate$/i, /^github-actions$/i];
const NOISE_TITLE_PATTERNS = [
  /^revert\s+"revert/i,              // revert-of-revert
  /^bump\s/i,                         // dependency bumps
  /^update.*\bto\b.*\d/i,            // "Update X to v1.2.3"
  /^upgrade\s/i,                      // "Upgrade React from X to Y"
  /^\[ci\]/i,                         // CI-only
  /^chore\(deps\)/i,                  // chore(deps): bump
];

function isBot(author: string): boolean {
  return BOT_PATTERNS.some((p) => p.test(author));
}

function isNoise(pr: PullRequest): boolean {
  if (isBot(pr.author)) return true;
  if (NOISE_TITLE_PATTERNS.some((p) => p.test(pr.title))) return true;
  // Pure revert with nothing else
  if (/^revert\s+"/i.test(pr.title) && pr.labels.length === 0) return true;
  return false;
}

// ── Smart grouping ─────────────────────────────────────────────────────

const SMART_SECTIONS: { heading: string; match: (pr: PullRequest) => boolean }[] = [
  {
    heading: "New Features",
    match: (pr) =>
      pr.labels.some((l) => /feature|enhancement/i.test(l)) ||
      /^feat[:(]/i.test(pr.title),
  },
  {
    heading: "Bug Fixes",
    match: (pr) =>
      pr.labels.some((l) => /bug|fix/i.test(l)) ||
      /^fix[:(]/i.test(pr.title) ||
      /^fix:\s/i.test(pr.title),
  },
  {
    heading: "Improvements",
    match: (pr) =>
      pr.labels.some((l) => /refactor|perf|improvement/i.test(l)) ||
      /^(refactor|perf|improve)[:(]/i.test(pr.title) ||
      // Anything that reads like an improvement but isn't a feature or fix
      /^(simplify|extract|reduce|optimize|add.*support)/i.test(pr.title),
  },
];

export interface SmartSection {
  heading: string;
  items: { number: number; title: string; author: string; body: string }[];
}

/**
 * Filters noise, groups meaningfully, returns structured data for smart mode.
 */
export function groupSmartPRs(prs: PullRequest[]): { sections: SmartSection[]; maintenance: SmartSection | null } {
  const meaningful = prs.filter((pr) => !isNoise(pr));
  const maintenance = prs.filter((pr) => isNoise(pr));

  const placed = new Set<number>();
  const buckets: Record<string, PullRequest[]> = {};

  for (const sec of SMART_SECTIONS) {
    buckets[sec.heading] = [];
  }
  buckets["Improvements"] = buckets["Improvements"] || [];

  for (const pr of meaningful) {
    let matched = false;
    for (const sec of SMART_SECTIONS) {
      if (sec.match(pr)) {
        buckets[sec.heading].push(pr);
        placed.add(pr.number);
        matched = true;
        break;
      }
    }
    if (!matched) {
      buckets["Improvements"].push(pr);
      placed.add(pr.number);
    }
  }

  const sections: SmartSection[] = [];
  for (const sec of SMART_SECTIONS) {
    if (buckets[sec.heading].length > 0) {
      sections.push({
        heading: sec.heading,
        items: buckets[sec.heading].map((pr) => ({ number: pr.number, title: pr.title, author: pr.author, body: pr.body.slice(0, 200) })),
      });
    }
  }

  const maintenanceSection: SmartSection | null = maintenance.length > 0
    ? { heading: "Maintenance", items: maintenance.map((pr) => ({ number: pr.number, title: pr.title, author: pr.author, body: "" })) }
    : null;

  return { sections, maintenance: maintenanceSection };
}

/**
 * Renders the smart changelog output: a deterministic fallback summary
 * followed by a rewrite prompt for the host AI.
 */
export function renderSmartChangelog(
  prs: PullRequest[],
  version: string,
  date: string
): string {
  const { sections, maintenance } = groupSmartPRs(prs);

  if (sections.length === 0 && !maintenance) {
    return "No meaningful changes found in this range.";
  }

  // Deterministic fallback: clean grouped notes (usable as-is)
  const lines: string[] = [];
  lines.push(`## ${version} — ${date}`);
  lines.push("");

  for (const sec of sections) {
    lines.push(`### ${sec.heading}`);
    lines.push("");
    for (const item of sec.items) {
      lines.push(`- ${item.title} (#${item.number}) — @${item.author}`);
    }
    lines.push("");
  }

  if (maintenance) {
    lines.push(`### Maintenance`);
    lines.push("");
    lines.push(`${maintenance.items.length} changes: dependency updates, CI fixes, and reverts.`);
    lines.push("");
  }

  const fallback = lines.join("\n");

  // Rewrite instruction for the host AI
  const prompt = [
    "---",
    "",
    "**Instructions for the AI assistant:** The changelog above uses raw PR titles. Please rewrite it following these rules:",
    "1. Rewrite each bullet into a short, plain-English, benefit-focused sentence (what the user gains, not the internal commit message).",
    "2. Keep the section headings (New Features / Bug Fixes / Improvements / Maintenance).",
    "3. Keep PR numbers as (#NNNN) at the end of each line.",
    "4. Drop the @author attribution in the rewrite.",
    "5. For the Maintenance section, keep it as a single summary line (don't expand).",
    "6. Output ONLY the rewritten changelog in markdown (no commentary). The result should be ready to paste into a GitHub Release.",
    "",
  ].join("\n");

  return fallback + prompt;
}

// ── Original (raw) mode below ──────────────────────────────────────────
/**
 * Default mapping from label patterns to changelog section headings.
 * Each key is a section heading; the value is a list of label substrings
 * that match PRs into that section.
 */
const DEFAULT_SECTIONS: Record<string, string[]> = {
  Added: ["feature", "enhancement", "feat"],
  Fixed: ["bug", "fix", "bugfix", "patch"],
  Changed: ["breaking", "refactor", "improvement", "chore", "change"],
  Internal: ["internal", "ci", "test", "docs", "dependencies", "deps"],
};

/**
 * Maps a conventional-commit prefix to a section heading.
 */
const CONVENTIONAL_MAP: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  refactor: "Changed",
  perf: "Changed",
  chore: "Changed",
  docs: "Internal",
  test: "Internal",
  ci: "Internal",
  build: "Internal",
  style: "Internal",
};

/**
 * Extracts a conventional-commit prefix from a PR title.
 * Returns null if the title does not follow the convention.
 */
function extractConventionalPrefix(title: string): string | null {
  const match = title.match(/^(\w+)(?:\(.+?\))?!?:\s/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Groups pull requests into changelog sections based on labels and
 * conventional commit prefixes.
 *
 * If `customSections` is provided, it is used instead of the default mapping.
 * PRs that do not match any section go into "Other".
 */
export function groupPRs(
  prs: PullRequest[],
  includeInternal: boolean,
  customSections?: Record<string, string[]>
): ChangelogSection[] {
  const sectionMap = customSections ?? DEFAULT_SECTIONS;
  const buckets: Record<string, PullRequest[]> = {};

  // Initialize buckets
  for (const heading of Object.keys(sectionMap)) {
    buckets[heading] = [];
  }
  buckets["Other"] = [];

  for (const pr of prs) {
    let placed = false;

    // First try label matching
    for (const [heading, patterns] of Object.entries(sectionMap)) {
      const matches = pr.labels.some((label) =>
        patterns.some((p) => label.toLowerCase().includes(p.toLowerCase()))
      );
      if (matches) {
        buckets[heading].push(pr);
        placed = true;
        break;
      }
    }

    // Fall back to conventional commit prefix
    if (!placed) {
      const prefix = extractConventionalPrefix(pr.title);
      if (prefix && CONVENTIONAL_MAP[prefix]) {
        const heading = CONVENTIONAL_MAP[prefix];
        if (!buckets[heading]) buckets[heading] = [];
        buckets[heading].push(pr);
        placed = true;
      }
    }

    if (!placed) {
      buckets["Other"].push(pr);
    }
  }

  // Build output, filtering empty sections and optionally Internal
  const sections: ChangelogSection[] = [];
  for (const [heading, items] of Object.entries(buckets)) {
    if (items.length === 0) continue;
    if (heading === "Internal" && !includeInternal) continue;
    sections.push({ heading, items });
  }

  return sections;
}

/**
 * Formats a single PR as a bullet point.
 */
function formatItem(pr: PullRequest): string {
  return `- ${pr.title} ([#${pr.number}](https://github.com/${pr.author})) by @${pr.author}`;
}

/**
 * Renders a changelog string using the Keep a Changelog format.
 *
 * https://keepachangelog.com/en/1.1.0/
 */
function renderKeepAChangelog(
  sections: ChangelogSection[],
  version: string,
  date: string
): string {
  const lines: string[] = [];
  lines.push(`## [${version}] - ${date}`);
  lines.push("");

  for (const section of sections) {
    lines.push(`### ${section.heading}`);
    lines.push("");
    for (const item of section.items) {
      lines.push(formatItem(item));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Renders a minimal changelog -- just a flat bullet list, no section headers.
 */
function renderMinimal(
  sections: ChangelogSection[],
  version: string,
  date: string
): string {
  const lines: string[] = [];
  lines.push(`## ${version} (${date})`);
  lines.push("");

  for (const section of sections) {
    for (const item of section.items) {
      lines.push(formatItem(item));
    }
  }

  lines.push("");
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Renders a changelog using the specified template.
 */
export function renderChangelog(
  sections: ChangelogSection[],
  template: ChangelogTemplate,
  version: string,
  date: string
): string {
  switch (template) {
    case "keepachangelog":
      return renderKeepAChangelog(sections, version, date);
    case "minimal":
      return renderMinimal(sections, version, date);
    case "custom":
      // Custom uses the same structure as keepachangelog but with
      // user-provided section mappings (handled upstream in groupPRs).
      return renderKeepAChangelog(sections, version, date);
    default:
      return renderKeepAChangelog(sections, version, date);
  }
}
