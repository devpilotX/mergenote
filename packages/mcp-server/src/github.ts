import { Octokit } from "@octokit/rest";
import type { PullRequest } from "./types.js";

let octokitInstance: Octokit | null = null;

/**
 * Returns a shared Octokit instance. Creates one on first call using the
 * GITHUB_TOKEN env var. Throws if no token is set.
 */
export function getOctokit(): Octokit {
  if (octokitInstance) return octokitInstance;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set. Add it to your environment to use the GitHub tools.");
  }

  octokitInstance = new Octokit({ auth: token });
  return octokitInstance;
}

/**
 * Resets the cached Octokit instance. Useful in tests.
 */
export function resetOctokit(): void {
  octokitInstance = null;
}

/**
 * Gets the commit date for a given tag in a repository.
 */
export async function getTagDate(owner: string, repo: string, tag: string): Promise<Date> {
  const octokit = getOctokit();

  // Resolve the tag ref to a commit SHA
  const refResponse = await octokit.git.getRef({
    owner,
    repo,
    ref: `tags/${tag}`,
  });

  let sha = refResponse.data.object.sha;

  // If it is an annotated tag, dereference to the commit
  if (refResponse.data.object.type === "tag") {
    const tagObj = await octokit.git.getTag({ owner, repo, tag_sha: sha });
    sha = tagObj.data.object.sha;
  }

  const commit = await octokit.git.getCommit({ owner, repo, commit_sha: sha });
  return new Date(commit.data.committer.date);
}

/**
 * Fetches merged pull requests in a date range, with optional label filtering.
 * Handles pagination automatically.
 */
export async function fetchMergedPRs(
  owner: string,
  repo: string,
  since: Date,
  until: Date,
  labelFilter?: string[],
): Promise<PullRequest[]> {
  const octokit = getOctokit();
  const results: PullRequest[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await octokit.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: perPage,
      page,
    });

    const pulls = response.data;
    if (pulls.length === 0) break;

    // If the oldest PR on this page was updated before our window, we can
    // stop after processing this page.
    let reachedEnd = false;

    for (const pr of pulls) {
      if (!pr.merged_at) continue;

      const mergedAt = new Date(pr.merged_at);
      if (mergedAt < since) {
        reachedEnd = true;
        continue;
      }
      if (mergedAt > until) continue;

      const prLabels = pr.labels.map((l) => l.name ?? "");

      if (labelFilter && labelFilter.length > 0) {
        const hasMatch = labelFilter.some((f) => prLabels.includes(f));
        if (!hasMatch) continue;
      }

      const bodyTruncated = pr.body
        ? pr.body.length > 500
          ? pr.body.slice(0, 500) + "..."
          : pr.body
        : "";

      results.push({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? "unknown",
        labels: prLabels,
        merged_at: pr.merged_at,
        body: bodyTruncated,
        url: pr.html_url,
      });
    }

    if (reachedEnd || pulls.length < perPage) break;
    page++;
  }

  // Sort by merge date ascending
  results.sort((a, b) => new Date(a.merged_at).getTime() - new Date(b.merged_at).getTime());

  return results;
}

/**
 * Creates or updates a file in a repository via a commit.
 */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string,
): Promise<string> {
  const octokit = getOctokit();

  // Check if the file already exists to get its SHA
  let existingSha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ...(branch ? { ref: branch } : {}),
    });
    if (!Array.isArray(existing.data) && existing.data.type === "file") {
      existingSha = existing.data.sha;
    }
  } catch {
    // File does not exist, that is fine
  }

  const response = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    ...(existingSha ? { sha: existingSha } : {}),
    ...(branch ? { branch } : {}),
  });

  return response.data.content?.html_url ?? response.data.commit.html_url ?? "";
}

/**
 * Creates a branch from the default branch of a repository.
 */
export async function createBranch(owner: string, repo: string, branchName: string): Promise<void> {
  const octokit = getOctokit();

  const repoData = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.data.default_branch;

  const ref = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.data.object.sha,
  });
}

/**
 * Opens a pull request.
 */
export async function openPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base?: string,
): Promise<string> {
  const octokit = getOctokit();

  if (!base) {
    const repoData = await octokit.repos.get({ owner, repo });
    base = repoData.data.default_branch;
  }

  const pr = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  return pr.data.html_url;
}

/**
 * Creates a GitHub Release.
 */
export async function createGitHubRelease(
  owner: string,
  repo: string,
  tagName: string,
  name: string,
  body: string,
  draft: boolean,
): Promise<string> {
  const octokit = getOctokit();

  const release = await octokit.repos.createRelease({
    owner,
    repo,
    tag_name: tagName,
    name,
    body,
    draft,
  });

  return release.data.html_url;
}
