import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubToken,
  githubJson,
  GitHubApiError,
  hasNextLink,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Repository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  updated_at: string;
  pushed_at: string | null;
};

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
  files?: Array<{ filename: string; status: string }>;
};
type Account = { login: string };

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const token = await getGitHubToken(session.uid);
    if (!token) {
      return NextResponse.json(
        { error: "Connect a GitHub account in Settings to show project activity." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [{ data: repositories, response }, { data: account }] =
      await Promise.all([
        githubJson<Repository[]>(
          token,
          "/user/repos?sort=pushed&direction=desc&per_page=100&page=1&affiliation=owner,collaborator,organization_member",
        ),
        githubJson<Account>(token, "/user"),
      ]);
    const recentRepositories = repositories
      .filter((repository) => repository.pushed_at)
      .sort((a, b) =>
        (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""),
      )
      .slice(0, 6);

    const latestActivity = await Promise.all(
      recentRepositories.map(async (repository) => {
        const repoPath = `/repos/${encodeURIComponent(repository.full_name.split("/")[0])}/${encodeURIComponent(repository.name)}`;
        try {
          const { data: commits } = await githubJson<CommitSummary[]>(
            token,
            `${repoPath}/commits?per_page=1`,
          );
          const summary = commits[0];
          if (!summary) return null;
          const { data: commit } = await githubJson<CommitDetails>(
            token,
            `${repoPath}/commits/${encodeURIComponent(summary.sha)}`,
          );
          return {
            repository: {
              id: repository.id,
              name: repository.name,
              fullName: repository.full_name,
              url: repository.html_url,
              description: repository.description,
              visibility: repository.private ? "private" : "public",
              language: repository.language,
              defaultBranch: repository.default_branch,
              stars: repository.stargazers_count,
              forks: repository.forks_count,
              pushedAt: repository.pushed_at,
            },
            commit: {
              sha: commit.sha,
              url: commit.html_url,
              message: commit.commit.message,
              author:
                commit.author?.login ||
                commit.commit.author?.name ||
                "Unknown author",
              date: commit.commit.author?.date ?? repository.pushed_at ?? "",
              additions: commit.stats?.additions ?? 0,
              deletions: commit.stats?.deletions ?? 0,
              changedFiles: commit.files?.length ?? 0,
            },
          };
        } catch (error) {
          if (
            error instanceof GitHubApiError &&
            (error.status === 404 || error.status === 409)
          ) {
            return null;
          }
          throw error;
        }
      }),
    );

    const popular = [...repositories]
      .sort((a, b) =>
        b.stargazers_count - a.stargazers_count ||
        b.forks_count - a.forks_count,
      )
      .slice(0, 4)
      .map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        url: repository.html_url,
        description: repository.description,
        visibility: repository.private ? "private" : "public",
        language: repository.language,
        defaultBranch: repository.default_branch,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        pushedAt: repository.pushed_at,
      }));
    const now = Date.now();
    const recentlyUpdated = repositories.filter(
      (repository) =>
        repository.pushed_at &&
        now - new Date(repository.pushed_at).getTime() <= 30 * 24 * 60 * 60 * 1000,
    ).length;

    return NextResponse.json(
      {
        account: { login: account.login },
        stats: {
          repositories: repositories.length,
          stars: repositories.reduce(
            (total, repository) => total + repository.stargazers_count,
            0,
          ),
          forks: repositories.reduce(
            (total, repository) => total + repository.forks_count,
            0,
          ),
          activeThisMonth: recentlyUpdated,
          hasMore: hasNextLink(response.headers.get("link")),
        },
        latestActivity: latestActivity
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.commit.date.localeCompare(a.commit.date)),
        popular,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof GitHubApiError ? error.status : 502;
    if (!(error instanceof GitHubApiError)) {
      console.error("[github/overview] failed to load project overview:", error);
    }
    return NextResponse.json(
      { error: getGitHubMessage(error) },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
