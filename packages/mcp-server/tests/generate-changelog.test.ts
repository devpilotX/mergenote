import { describe, it, expect } from "vitest";
import { groupPRs, renderChangelog } from "../src/templates.js";
import type { PullRequest, ChangelogSection } from "../src/types.js";

// --- Helpers ---

function makePR(
  overrides: Partial<PullRequest> & { title: string }
): PullRequest {
  return {
    number: 1,
    author: "dev",
    labels: [],
    merged_at: "2026-06-15T12:00:00Z",
    body: "",
    ...overrides,
  };
}

// --- groupPRs tests ---

describe("groupPRs", () => {
  it("should group PRs by label into default sections", () => {
    const prs: PullRequest[] = [
      makePR({ number: 1, title: "New widget", labels: ["enhancement"] }),
      makePR({ number: 2, title: "Fix crash", labels: ["bug"] }),
      makePR({ number: 3, title: "Refactor code", labels: ["refactor"] }),
    ];

    const sections = groupPRs(prs, false);
    const headings = sections.map((s) => s.heading);

    expect(headings).toContain("Added");
    expect(headings).toContain("Fixed");
    expect(headings).toContain("Changed");

    const added = sections.find((s) => s.heading === "Added")!;
    expect(added.items).toHaveLength(1);
    expect(added.items[0].number).toBe(1);
  });

  it("should fall back to conventional commit prefix when no labels match", () => {
    const prs: PullRequest[] = [
      makePR({ number: 10, title: "feat: add dark mode", labels: [] }),
      makePR({ number: 11, title: "fix: null pointer", labels: [] }),
      makePR({ number: 12, title: "chore: bump deps", labels: [] }),
    ];

    const sections = groupPRs(prs, false);
    const headings = sections.map((s) => s.heading);

    expect(headings).toContain("Added");
    expect(headings).toContain("Fixed");
    expect(headings).toContain("Changed");

    expect(
      sections.find((s) => s.heading === "Added")!.items[0].number
    ).toBe(10);
    expect(
      sections.find((s) => s.heading === "Fixed")!.items[0].number
    ).toBe(11);
  });

  it("should place unmatched PRs into Other", () => {
    const prs: PullRequest[] = [
      makePR({ number: 20, title: "Random update", labels: [] }),
    ];

    const sections = groupPRs(prs, false);
    const other = sections.find((s) => s.heading === "Other");
    expect(other).toBeDefined();
    expect(other!.items).toHaveLength(1);
  });

  it("should exclude Internal section when include_internal is false", () => {
    const prs: PullRequest[] = [
      makePR({ number: 30, title: "CI: fix pipeline", labels: ["ci"] }),
      makePR({ number: 31, title: "Add button", labels: ["feature"] }),
    ];

    const sections = groupPRs(prs, false);
    const headings = sections.map((s) => s.heading);
    expect(headings).not.toContain("Internal");
    expect(headings).toContain("Added");
  });

  it("should include Internal section when include_internal is true", () => {
    const prs: PullRequest[] = [
      makePR({ number: 30, title: "CI: fix pipeline", labels: ["ci"] }),
    ];

    const sections = groupPRs(prs, true);
    const headings = sections.map((s) => s.heading);
    expect(headings).toContain("Internal");
  });

  it("should use custom_sections when provided", () => {
    const customSections = {
      "New Stuff": ["new"],
      "Bug Fixes": ["bugfix"],
    };
    const prs: PullRequest[] = [
      makePR({ number: 40, title: "New API", labels: ["new"] }),
      makePR({ number: 41, title: "Fix login", labels: ["bugfix"] }),
      makePR({ number: 42, title: "Other thing", labels: [] }),
    ];

    const sections = groupPRs(prs, false, customSections);
    const headings = sections.map((s) => s.heading);

    expect(headings).toContain("New Stuff");
    expect(headings).toContain("Bug Fixes");
    expect(headings).toContain("Other");
  });

  it("should handle conventional commit with scope", () => {
    const prs: PullRequest[] = [
      makePR({
        number: 50,
        title: "feat(auth): add OAuth support",
        labels: [],
      }),
    ];

    const sections = groupPRs(prs, false);
    const added = sections.find((s) => s.heading === "Added");
    expect(added).toBeDefined();
    expect(added!.items[0].number).toBe(50);
  });
});

// --- renderChangelog tests ---

describe("renderChangelog", () => {
  const sections: ChangelogSection[] = [
    {
      heading: "Added",
      items: [
        makePR({ number: 1, title: "Add dark mode", author: "alice" }),
        makePR({ number: 2, title: "Add search", author: "bob" }),
      ],
    },
    {
      heading: "Fixed",
      items: [
        makePR({ number: 3, title: "Fix crash on login", author: "carol" }),
      ],
    },
  ];

  it("should render keepachangelog format with version header", () => {
    const output = renderChangelog(sections, "keepachangelog", "v1.2.0", "2026-06-15");

    expect(output).toContain("## [v1.2.0] - 2026-06-15");
    expect(output).toContain("### Added");
    expect(output).toContain("### Fixed");
    expect(output).toContain("Add dark mode");
    expect(output).toContain("#1");
    expect(output).toContain("@alice");
  });

  it("should render minimal format without section headers", () => {
    const output = renderChangelog(sections, "minimal", "v1.2.0", "2026-06-15");

    expect(output).toContain("## v1.2.0 (2026-06-15)");
    expect(output).not.toContain("### Added");
    expect(output).not.toContain("### Fixed");
    expect(output).toContain("Add dark mode");
    expect(output).toContain("Fix crash on login");
  });

  it("should render custom format the same as keepachangelog", () => {
    const keepOutput = renderChangelog(
      sections,
      "keepachangelog",
      "v1.2.0",
      "2026-06-15"
    );
    const customOutput = renderChangelog(
      sections,
      "custom",
      "v1.2.0",
      "2026-06-15"
    );

    expect(customOutput).toBe(keepOutput);
  });

  it("should end with a newline", () => {
    const output = renderChangelog(sections, "keepachangelog", "v1.0.0", "2026-06-15");
    expect(output.endsWith("\n")).toBe(true);
  });
});
