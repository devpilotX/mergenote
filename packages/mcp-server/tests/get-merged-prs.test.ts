import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetMergedPRs } from "../src/tools/get-merged-prs.js";

// --- Mocks ---

// Mock the license module to control tier in tests
vi.mock("../src/license.js", () => ({
  getLicenseStatus: vi.fn(() => ({ valid: true, tier: "pro" })),
  isWithinFreeTierWindow: vi.fn(() => true),
}));

// Mock the github module so we never hit real APIs
vi.mock("../src/github.js", () => ({
  fetchMergedPRs: vi.fn(),
  getTagDate: vi.fn(),
}));

import { getLicenseStatus, isWithinFreeTierWindow } from "../src/license.js";
import { fetchMergedPRs, getTagDate } from "../src/github.js";

const mockedFetchMergedPRs = vi.mocked(fetchMergedPRs);
const mockedGetTagDate = vi.mocked(getTagDate);
const mockedGetLicenseStatus = vi.mocked(getLicenseStatus);
const mockedIsWithinFreeTierWindow = vi.mocked(isWithinFreeTierWindow);

// Helper: create a server, register the tool, and call it
async function callTool(args: Record<string, unknown>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetMergedPRs(server);

  // Access the registered tool handler via the internal tool map
  const tools = (server as any)._registeredTools;
  const tool = tools?.["get_merged_prs"];
  if (!tool?.handler) {
    throw new Error("get_merged_prs tool not registered");
  }
  return tool.handler(args, {} as any);
}

// --- Tests ---

describe("get_merged_prs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLicenseStatus.mockReturnValue({
      valid: true,
      tier: "pro",
    });
    mockedIsWithinFreeTierWindow.mockReturnValue(true);
  });

  it("should fetch PRs using default 7-day window when no range is given", async () => {
    mockedFetchMergedPRs.mockResolvedValue([
      {
        number: 1,
        title: "Add feature",
        author: "alice",
        labels: ["enhancement"],
        merged_at: "2026-06-15T12:00:00Z",
        body: "Some description",
      },
    ]);

    const result = await callTool({ owner: "org", repo: "app" });
    expect(result.isError).toBeUndefined();

    expect(mockedFetchMergedPRs).toHaveBeenCalledOnce();
    const [owner, repo, since, until] = mockedFetchMergedPRs.mock.calls[0];
    expect(owner).toBe("org");
    expect(repo).toBe("app");
    // The window should be roughly 7 days
    const diff = until.getTime() - since.getTime();
    expect(diff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].number).toBe(1);
  });

  it("should fetch PRs by tag range", async () => {
    mockedGetTagDate.mockImplementation(async (_o, _r, tag) => {
      if (tag === "v1.0.0") return new Date("2026-01-01T00:00:00Z");
      if (tag === "v1.1.0") return new Date("2026-02-01T00:00:00Z");
      throw new Error("Unknown tag");
    });
    mockedFetchMergedPRs.mockResolvedValue([]);

    await callTool({
      owner: "org",
      repo: "app",
      from_tag: "v1.0.0",
      to_tag: "v1.1.0",
    });

    expect(mockedGetTagDate).toHaveBeenCalledTimes(2);
    expect(mockedFetchMergedPRs).toHaveBeenCalledOnce();
    const [, , since, until] = mockedFetchMergedPRs.mock.calls[0];
    expect(since).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(until).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("should fetch PRs by date range", async () => {
    mockedFetchMergedPRs.mockResolvedValue([]);

    await callTool({
      owner: "org",
      repo: "app",
      from_date: "2026-06-01T00:00:00Z",
      to_date: "2026-06-07T00:00:00Z",
    });

    expect(mockedFetchMergedPRs).toHaveBeenCalledOnce();
    const [, , since, until] = mockedFetchMergedPRs.mock.calls[0];
    expect(since).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(until).toEqual(new Date("2026-06-07T00:00:00Z"));
  });

  it("should pass label_filter through to fetchMergedPRs", async () => {
    mockedFetchMergedPRs.mockResolvedValue([]);

    await callTool({
      owner: "org",
      repo: "app",
      label_filter: ["bug", "critical"],
    });

    expect(mockedFetchMergedPRs).toHaveBeenCalledOnce();
    const labelFilter = mockedFetchMergedPRs.mock.calls[0][4];
    expect(labelFilter).toEqual(["bug", "critical"]);
  });

  it("should return an error for invalid date formats", async () => {
    const result = await callTool({
      owner: "org",
      repo: "app",
      from_date: "not-a-date",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid from_date");
  });

  it("should surface GitHub API errors clearly", async () => {
    mockedFetchMergedPRs.mockRejectedValue(
      new Error("API rate limit exceeded - 403")
    );

    const result = await callTool({ owner: "org", repo: "app" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("rate limit");
  });
});
