import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPostChangelog } from "../src/tools/post-changelog.js";

// --- Mocks ---

vi.mock("../src/github.js", () => ({
  createOrUpdateFile: vi.fn(),
  createBranch: vi.fn(),
  openPullRequest: vi.fn(),
  createGitHubRelease: vi.fn(),
}));

import {
  createOrUpdateFile,
  createBranch,
  openPullRequest,
  createGitHubRelease,
} from "../src/github.js";

const mockedCreateOrUpdateFile = vi.mocked(createOrUpdateFile);
const mockedCreateBranch = vi.mocked(createBranch);
const mockedOpenPullRequest = vi.mocked(openPullRequest);
const mockedCreateGitHubRelease = vi.mocked(createGitHubRelease);

// Helper: create a server, register the tool, and call it
async function callTool(args: Record<string, unknown>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerPostChangelog(server);

  const tools = (server as any)._registeredTools;
  const tool = tools?.["post_changelog"];
  if (!tool?.handler) {
    throw new Error("post_changelog tool not registered");
  }
  return tool.handler(args, {} as any);
}

const CHANGELOG_CONTENT = "## [v1.0.0] - 2026-06-15\n\n### Added\n\n- Feature\n";

// --- Tests ---

describe("post_changelog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("file action", () => {
    it("should commit the changelog to the default path", async () => {
      mockedCreateOrUpdateFile.mockResolvedValue(
        "https://github.com/org/app/blob/main/CHANGELOG.md"
      );

      const result = await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "file",
        version: "v1.0.0",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("CHANGELOG.md");
      expect(mockedCreateOrUpdateFile).toHaveBeenCalledWith(
        "org",
        "app",
        "CHANGELOG.md",
        CHANGELOG_CONTENT,
        expect.stringContaining("v1.0.0")
      );
    });

    it("should use a custom file_path when provided", async () => {
      mockedCreateOrUpdateFile.mockResolvedValue("https://example.com");

      await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "file",
        file_path: "docs/RELEASES.md",
      });

      expect(mockedCreateOrUpdateFile).toHaveBeenCalledWith(
        "org",
        "app",
        "docs/RELEASES.md",
        CHANGELOG_CONTENT,
        expect.any(String)
      );
    });
  });

  describe("pull_request action", () => {
    it("should create a branch, commit, and open a PR", async () => {
      mockedCreateBranch.mockResolvedValue(undefined);
      mockedCreateOrUpdateFile.mockResolvedValue("https://example.com/file");
      mockedOpenPullRequest.mockResolvedValue(
        "https://github.com/org/app/pull/42"
      );

      const result = await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "pull_request",
        version: "v1.0.0",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("pull/42");

      expect(mockedCreateBranch).toHaveBeenCalledWith(
        "org",
        "app",
        "changelog/v1.0.0"
      );
      expect(mockedCreateOrUpdateFile).toHaveBeenCalledWith(
        "org",
        "app",
        "CHANGELOG.md",
        CHANGELOG_CONTENT,
        expect.any(String),
        "changelog/v1.0.0"
      );
      expect(mockedOpenPullRequest).toHaveBeenCalledWith(
        "org",
        "app",
        expect.stringContaining("v1.0.0"),
        expect.any(String),
        "changelog/v1.0.0"
      );
    });

    it("should use a custom branch name when provided", async () => {
      mockedCreateBranch.mockResolvedValue(undefined);
      mockedCreateOrUpdateFile.mockResolvedValue("https://example.com/file");
      mockedOpenPullRequest.mockResolvedValue("https://example.com/pr");

      await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "pull_request",
        version: "v1.0.0",
        branch: "release/v1.0.0-notes",
      });

      expect(mockedCreateBranch).toHaveBeenCalledWith(
        "org",
        "app",
        "release/v1.0.0-notes"
      );
    });

    it("should tolerate an existing branch", async () => {
      mockedCreateBranch.mockRejectedValue(
        new Error("Reference already exists")
      );
      mockedCreateOrUpdateFile.mockResolvedValue("https://example.com/file");
      mockedOpenPullRequest.mockResolvedValue("https://example.com/pr");

      const result = await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "pull_request",
        version: "v1.0.0",
      });

      expect(result.isError).toBeUndefined();
      expect(mockedCreateOrUpdateFile).toHaveBeenCalled();
    });
  });

  describe("github_release action", () => {
    it("should create a draft release by default", async () => {
      mockedCreateGitHubRelease.mockResolvedValue(
        "https://github.com/org/app/releases/tag/v1.0.0"
      );

      const result = await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "github_release",
        version: "v1.0.0",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("draft");
      expect(mockedCreateGitHubRelease).toHaveBeenCalledWith(
        "org",
        "app",
        "v1.0.0",
        "Release v1.0.0",
        CHANGELOG_CONTENT,
        true
      );
    });

    it("should prepend v to the tag if not present", async () => {
      mockedCreateGitHubRelease.mockResolvedValue("https://example.com/release");

      await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "github_release",
        version: "1.0.0",
      });

      expect(mockedCreateGitHubRelease).toHaveBeenCalledWith(
        "org",
        "app",
        "v1.0.0",
        expect.any(String),
        CHANGELOG_CONTENT,
        true
      );
    });

    it("should create a non-draft release when draft is false", async () => {
      mockedCreateGitHubRelease.mockResolvedValue("https://example.com/release");

      const result = await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "github_release",
        version: "v2.0.0",
        draft: false,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).not.toContain("draft");
      expect(mockedCreateGitHubRelease).toHaveBeenCalledWith(
        "org",
        "app",
        "v2.0.0",
        "Release v2.0.0",
        CHANGELOG_CONTENT,
        false
      );
    });
  });

  describe("error handling", () => {
    it("should surface rate limit errors", async () => {
      mockedCreateOrUpdateFile.mockRejectedValue(
        new Error("API rate limit exceeded - 403")
      );

      const result = await callTool({
        owner: "org",
        repo: "app",
        content: CHANGELOG_CONTENT,
        action: "file",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("rate limit");
    });
  });
});
