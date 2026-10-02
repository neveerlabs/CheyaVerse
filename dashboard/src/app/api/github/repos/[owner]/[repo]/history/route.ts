import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubToken,
  githubJson,
  hasNextLink,
  GitHubApiError,
  GITHUB_CREDENTIAL_COOKIE,
  lastPageFromLink,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_PAGE_SIZE = 3;
const HISTORY_RANGES = ["all", "month", "week", "day", "hour"] as const;
type HistoryRange = (typeof HISTORY_RANGES)[number];

type CommitSummary = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
};

type CommitDetails = CommitSummary & {
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
};

function getSince(range: HistoryRange): string | null {
  const now = Date.now();
  const durations: Record<Exclude<HistoryRange, "all">, number> = {
    month: 30 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
  };
  return range === "all" ? null : new Date(now - durations[range]).toISOString();
}

function validSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";
}

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!validSegment(params.owner) || !validSegment(params.repo)) {
    return NextResponse.json({ error: "Invalid repository path." }, { status: 400 });
  }
  const rangeValue = request.nextUrl.searchParams.get("range") ?? "all";
  const range = HISTORY_RANGES.includes(rangeValue as HistoryRange)
    ? (rangeValue as HistoryRange)
    : null;
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  if (!range || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
    return NextResponse.json({ error: "Invalid history range or page." }, { status: 400 });
  }

  try {
    const token = await getGitHubToken(
      session.uid,
      request.cookies.get(GITHUB_CREDENTIAL_COOKIE)?.value,
    );
    if (!token) {
      return NextResponse.json({ error: "Connect GitHub in Settings first." }, { status: 409 });
    }
    const since = getSince(range);
    const repoPath = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`;
    const query = new URLSearchParams({
      per_page: String(HISTORY_PAGE_SIZE),
      page: String(page),
    });
    if (since) query.set("since", since);
    const { data: summaries, response } = await githubJson<CommitSummary[]>(
      token,
      `${repoPath}/commits?${query.toString()}`,
    );

    const details: CommitDetails[] = [];
    for (let index = 0; index < summaries.length; index += 4) {
      const group = summaries.slice(index, index + 4);
      const loaded = await Promise.all(
        group.map(({ sha }) =>
          githubJson<CommitDetails>(
            token,
            `${repoPath}/commits/${encodeURIComponent(sha)}`,
          ).then(({ data }) => data),
        ),
      );
      details.push(...loaded);
    }
    const commits = details.map((commit) => ({
      sha: commit.sha,
      url: commit.html_url,
      message: commit.commit.message,
      author:
        commit.author?.login ||
        commit.commit.author?.name ||
        "Unknown author",
      date: commit.commit.author?.date ?? "",
      additions: commit.stats?.additions ?? 0,
      deletions: commit.stats?.deletions ?? 0,
      changedFiles: (commit.files ?? []).map((file, index) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: index < 20 ? file.patch?.slice(0, 1500) ?? null : null,
      })),
      filesTruncated: (commit.files?.length ?? 0) >= 300,
    }));
    const total = commits.reduce(
      (stats, commit) => ({
        commits: stats.commits + 1,
        additions: stats.additions + commit.additions,
        deletions: stats.deletions + commit.deletions,
        files: stats.files + commit.changedFiles.length,
      }),
      { commits: 0, additions: 0, deletions: 0, files: 0 },
    );
    const link = response.headers.get("link");
    return NextResponse.json(
      {
        range,
        since,
        page,
        commits,
        totals: total,
        hasMore: hasNextLink(link),
        totalPages: lastPageFromLink(link),
        pageSize: HISTORY_PAGE_SIZE,
        statsNote:
          "File totals and line changes cover the commits loaded so far. Select Load more to continue through the full history.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof GitHubApiError ? error.status : 502;
    if (!(error instanceof GitHubApiError)) {
      console.error("[github/history] failed to load commit history:", error);
    }
    return NextResponse.json({ error: getGitHubMessage(error) }, { status });
  }
}
