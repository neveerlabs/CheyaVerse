import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubCommitActivity,
  getGitHubResponseError,
  getGitHubToken,
  GitHubCredentialError,
  GitHubCommitActivityPoint,
  githubFetch,
  githubGraphql,
  githubJson,
  GitHubApiError,
  GITHUB_CREDENTIAL_COOKIE,
  hasNextLink,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_LIMIT = 24;
const RANKING_LIMIT = 12;
const HOME_PROJECT_LIMIT = 5;
const COMMIT_ACTIVITY_LIMIT = 1000;
const ACTIVITY_CONCURRENCY = 6;
const FEATURED_REPOSITORY = { owner: "neveerlabs", name: "CheyaVerse" };

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
    committer?: { name: string; date: string } | null;
  };
  author: { login: string } | null;
};

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  prerelease: boolean;
};

type CommitActivityWeek = { week: number; total: number };

type ProjectActivity = {
  repository: {
    id: number;
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    visibility: "private" | "public";
    language: string | null;
    defaultBranch: string;
    stars: number;
    forks: number;
    pushedAt: string | null;
  };
  history: {
    weeklyActivity: number[] | null;
    commitActivity: GitHubCommitActivityPoint[];
    commitActivityRange: "30d" | "all";
    commitActivityCount: number;
    commitActivityCapped: boolean;
    commitsLastYear: number;
    commitsLastFiveWeeks: number;
    commitsLastMonth: number;
    commitsLastMonthCapped: boolean;
    activeWeeks: number;
    activeMonths: number;
    activityRuns: number;
    recentChanges: {
      additions: number;
      deletions: number;
      averageLinesChanged: number;
      measuredCommits: number;
    };
  };
  latestCommit: {
    sha: string;
    url: string;
    message: string;
    author: string;
    date: string;
  } | null;
  latestRelease: {
    tagName: string;
    name: string | null;
    url: string;
    publishedAt: string | null;
    prerelease: boolean;
  } | null;
  rankingScore: number;
};

type ActivityCandidate = ProjectActivity;

async function getWeeklyActivity(
  token: string,
  owner: string,
  repository: string,
): Promise<number[] | null> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/stats/commit_activity`;
  const response = await githubFetch(token, path);

  if (response.status === 202) return null;
  if (response.status === 204 || response.status === 404) return [];
  if (!response.ok) throw await getGitHubResponseError(response);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new GitHubApiError("GitHub returned invalid commit activity data.", 502);
  }
  const weeks = payload
    .map((item): CommitActivityWeek => {
      if (typeof item !== "object" || item === null) {
        throw new GitHubApiError("GitHub returned invalid commit activity data.", 502);
      }
      const row = item as Record<string, unknown>;
      if (
        typeof row.week !== "number" ||
        !Number.isSafeInteger(row.week) ||
        row.week <= 0 ||
        typeof row.total !== "number" ||
        !Number.isFinite(row.total) ||
        row.total < 0
      ) {
        throw new GitHubApiError("GitHub returned invalid commit activity data.", 502);
      }
      return { week: row.week, total: row.total };
    })
    .sort((a, b) => a.week - b.week)
    .slice(-52);
  const counts = weeks.map((item) => Math.floor(item.total));
  return [...Array(Math.max(0, 52 - counts.length)).fill(0), ...counts];
}

async function loadActivityCandidate(
  token: string,
  repository: Repository,
): Promise<ActivityCandidate> {
  const repoPath = `/repos/${encodeURIComponent(repository.full_name.split("/")[0])}/${encodeURIComponent(repository.name)}`;
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const [weeklyActivity, recentCommitPage] = await Promise.all([
    getWeeklyActivity(token, repository.full_name.split("/")[0], repository.name),
    githubJson<CommitSummary[]>(
      token,
      `${repoPath}/commits?per_page=100`,
    ).then(({ data, response }) => ({ commits: data, response })),
  ]);
  const monthlyCommitSummaries = recentCommitPage.commits.filter((commit) => {
    const date =
      commit.commit.author?.date ?? commit.commit.committer?.date;
    return date ? new Date(date).getTime() >= since : false;
  });
  const monthlyCommitsCapped =
    monthlyCommitSummaries.length === recentCommitPage.commits.length &&
    hasNextLink(recentCommitPage.response.headers.get("link"));
  const activeWeeks =
    weeklyActivity?.filter((count) => count > 0).length ?? 0;
  const activityMonths = new Set<number>();
  const currentMonth = new Date();
  const earliestMonth =
    currentMonth.getUTCFullYear() * 12 + currentMonth.getUTCMonth() - 11;
  weeklyActivity?.forEach((count, index) => {
    if (count <= 0) return;
    const weekDate = new Date(
      Date.now() -
        (weeklyActivity.length - 1 - index) * 7 * 24 * 60 * 60 * 1000,
    );
    const month = weekDate.getUTCFullYear() * 12 + weekDate.getUTCMonth();
    if (month < earliestMonth) return;
    activityMonths.add(month);
  });
  const sortedActivityMonths = [...activityMonths].sort((a, b) => a - b);
  const activeMonths = sortedActivityMonths.length;
  const activityRuns = sortedActivityMonths.reduce(
    (runs, month, index) =>
      index === 0 || month - sortedActivityMonths[index - 1] > 1
        ? runs + 1
        : runs,
    0,
  );
  const latest = recentCommitPage.commits[0];
  const latestCommit: ProjectActivity["latestCommit"] = latest
    ? {
        sha: latest.sha,
        url: latest.html_url,
        message: latest.commit.message,
        author:
          latest.author?.login ||
          latest.commit.author?.name ||
          "Unknown author",
        date:
          latest.commit.author?.date ??
          latest.commit.committer?.date ??
          repository.pushed_at ??
          "",
      }
    : null;

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
    history: {
      weeklyActivity,
      commitActivity: [],
      commitActivityRange: "30d",
      commitActivityCount: monthlyCommitSummaries.length,
      commitActivityCapped: monthlyCommitsCapped,
      commitsLastYear: weeklyActivity?.reduce((sum, count) => sum + count, 0) ?? 0,
      commitsLastFiveWeeks:
        weeklyActivity?.slice(-5).reduce((sum, count) => sum + count, 0) ?? 0,
      commitsLastMonth: monthlyCommitSummaries.length,
      commitsLastMonthCapped: monthlyCommitsCapped,
      activeWeeks,
      activeMonths,
      activityRuns,
      recentChanges: {
        additions: 0,
        deletions: 0,
        averageLinesChanged: 0,
        measuredCommits: 0,
      },
    },
    latestCommit,
    latestRelease: null,
    rankingScore: 0,
  };
}

async function loadActivityCandidates(
  token: string,
  repositories: Repository[],
): Promise<ActivityCandidate[]> {
  const projects: ActivityCandidate[] = [];
  for (let index = 0; index < repositories.length; index += ACTIVITY_CONCURRENCY) {
    const group = repositories.slice(index, index + ACTIVITY_CONCURRENCY);
    const loaded = await Promise.all(
      group.map(async (repository) => {
        try {
          return await loadActivityCandidate(token, repository);
        } catch (error) {
          if (
            error instanceof GitHubApiError &&
            [404, 409].includes(error.status)
          ) {
            return null;
          }
          throw error;
        }
      }),
    );
    projects.push(...loaded.filter((project): project is ActivityCandidate => project !== null));
  }
  return projects;
}

function scoreProjects(projects: ProjectActivity[]): ProjectActivity[] {
  const max = (select: (project: ProjectActivity) => number) =>
    Math.max(1, ...projects.map((project) => select(project)));
  const maxMonth = max((project) => Math.log1p(project.history.commitsLastMonth));
  const maxYear = max((project) => Math.log1p(project.history.commitsLastYear));
  const maxChanges = max((project) =>
    Math.log1p(project.history.recentChanges.averageLinesChanged),
  );
  const maxPopularity = max(
    (project) =>
      Math.log1p(project.repository.stars) +
      Math.log1p(project.repository.forks) * 0.6,
  );

  return projects
    .map((project) => {
      const pushedAt = project.repository.pushedAt
        ? new Date(project.repository.pushedAt).getTime()
        : Number.NaN;
      const ageDays = Number.isFinite(pushedAt)
        ? Math.max(0, (Date.now() - pushedAt) / (24 * 60 * 60 * 1000))
        : Number.POSITIVE_INFINITY;
      const popularity =
        Math.log1p(project.repository.stars) +
        Math.log1p(project.repository.forks) * 0.6;
      const score =
        0.3 * Math.log1p(project.history.commitsLastMonth) / maxMonth +
        0.16 * Math.log1p(project.history.commitsLastYear) / maxYear +
        0.12 * project.history.activeWeeks / 52 +
        0.08 * project.history.activeMonths / 12 +
        0.06 * project.history.activityRuns / 12 +
        0.14 *
          Math.log1p(project.history.recentChanges.averageLinesChanged) /
          maxChanges +
        0.08 * popularity / maxPopularity +
        0.06 * Math.exp(-ageDays / 120);
      return { ...project, rankingScore: score };
    })
    .sort(
      (a, b) =>
        b.rankingScore - a.rankingScore ||
        b.history.commitsLastMonth - a.history.commitsLastMonth ||
        b.repository.stars - a.repository.stars,
    );
}

async function addProjectInsights(
  token: string,
  candidates: ActivityCandidate[],
): Promise<ProjectActivity[]> {
  const projects: ProjectActivity[] = [];
  for (let index = 0; index < candidates.length; index += ACTIVITY_CONCURRENCY) {
    const group = candidates.slice(index, index + ACTIVITY_CONCURRENCY);
    const loaded = await Promise.all(
      group.map(async (candidate) => {
        const owner = candidate.repository.fullName.split("/")[0];
        const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(candidate.repository.name)}`;
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const [recentCommitActivity, release] = await Promise.all([
          getGitHubCommitActivity(
            token,
            owner,
            candidate.repository.name,
            since,
            COMMIT_ACTIVITY_LIMIT,
          ),
          githubJson<GitHubRelease[]>(token, `${repoPath}/releases?per_page=1`)
            .then(({ data }) => data[0] ?? null)
            .catch((error: unknown) => {
              if (error instanceof GitHubApiError && [403, 404].includes(error.status)) {
                return null;
              }
              throw error;
            }),
        ]);
        const commitActivity =
          recentCommitActivity.totalCount > 0
            ? { ...recentCommitActivity, range: "30d" as const }
            : {
                ...(await getGitHubCommitActivity(
                  token,
                  owner,
                  candidate.repository.name,
                  "1970-01-01T00:00:00Z",
                  COMMIT_ACTIVITY_LIMIT,
                )),
                range: "all" as const,
              };
        const additions = recentCommitActivity.commits.reduce(
          (total, commit) => total + commit.additions,
          0,
        );
        const deletions = recentCommitActivity.commits.reduce(
          (total, commit) => total + commit.deletions,
          0,
        );
        const measuredCommits = recentCommitActivity.commits.length;
        return {
          repository: candidate.repository,
          history: {
            ...candidate.history,
            commitActivity: commitActivity.commits,
            commitActivityRange: commitActivity.range,
            commitActivityCount: commitActivity.totalCount,
            commitActivityCapped: commitActivity.capped,
            commitsLastMonth: recentCommitActivity.totalCount,
            commitsLastMonthCapped: recentCommitActivity.capped,
            recentChanges: {
              measuredCommits,
              additions,
              deletions,
              averageLinesChanged:
                measuredCommits > 0
                  ? (additions + deletions) / measuredCommits
                  : 0,
            },
          },
          latestCommit: candidate.latestCommit,
          latestRelease: release
            ? {
                tagName: release.tag_name,
                name: release.name,
                url: release.html_url,
                publishedAt: release.published_at,
                prerelease: release.prerelease,
              }
            : null,
          rankingScore: candidate.rankingScore,
        };
      }),
    );
    projects.push(...loaded);
  }
  return projects;
}

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const token = await getGitHubToken(
      session.uid,
      request.cookies.get(GITHUB_CREDENTIAL_COOKIE)?.value,
    );
    if (!token) {
      return NextResponse.json(
        {
          code: "GITHUB_NOT_CONNECTED",
          error: "Connect a GitHub account in Settings to show project activity.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: repositories, response } = await githubJson<Repository[]>(
      token,
      "/user/repos?sort=pushed&direction=desc&per_page=100&page=1&affiliation=owner,collaborator,organization_member",
    );
    const now = Date.now();
    const candidates = repositories
      .map((repository) => {
        const pushedAt = new Date(repository.pushed_at ?? repository.updated_at).getTime();
        const ageDays = Number.isFinite(pushedAt)
          ? Math.max(0, (now - pushedAt) / (24 * 60 * 60 * 1000))
          : Number.POSITIVE_INFINITY;
        return {
          repository,
          popularity:
            Math.log1p(repository.stargazers_count) +
            Math.log1p(repository.forks_count) * 0.6,
          recency: Math.exp(-ageDays / 120),
        };
      })
      .sort(
        (a, b) =>
          b.popularity + b.recency * 8 - (a.popularity + a.recency * 8),
      )
      .slice(0, CANDIDATE_LIMIT)
      .map(({ repository }) => repository);
    const activityCandidates = await loadActivityCandidates(
      token,
      candidates,
    );
    const candidateById = new Map(
      activityCandidates.map((candidate) => [candidate.repository.id, candidate]),
    );
    const preliminaryRanking = scoreProjects(activityCandidates).slice(
      0,
      RANKING_LIMIT,
    );
    const detailedProjects = await addProjectInsights(
      token,
      preliminaryRanking.flatMap((project) => {
        const candidate = candidateById.get(project.repository.id);
        return candidate ? [candidate] : [];
      }),
    );
    const rankedProjects = scoreProjects(detailedProjects);
    const popularProjects = rankedProjects
      .filter(
        (project) =>
          project.repository.fullName.toLowerCase() !==
          `${FEATURED_REPOSITORY.owner}/${FEATURED_REPOSITORY.name}`.toLowerCase(),
      )
      .slice(0, HOME_PROJECT_LIMIT - 1);
    let featuredProject: ProjectActivity | null = null;
    try {
      const { data: featuredRepository } = await githubJson<Repository>(
        token,
        `/repos/${encodeURIComponent(FEATURED_REPOSITORY.owner)}/${encodeURIComponent(FEATURED_REPOSITORY.name)}`,
      );
      const candidate = await loadActivityCandidate(token, featuredRepository);
      featuredProject = (await addProjectInsights(token, [candidate]))[0] ?? null;
    } catch (error) {
      console.error("[github/overview] featured repository could not be loaded:", error);
    }
    const projects = [
      ...(featuredProject ? [featuredProject] : []),
      ...popularProjects.filter(
        (project) => project.repository.id !== featuredProject?.repository.id,
      ),
    ];
    const accountActivity = Array.from({ length: 52 }, (_, index) => ({
      week: index,
      commits: activityCandidates.reduce(
        (sum, project) =>
          sum + (project.history.weeklyActivity?.[index] ?? 0),
        0,
      ),
    }));
    const activeThisMonth = repositories.filter(
      (project) =>
        project.pushed_at &&
        now - new Date(project.pushed_at).getTime() <=
          30 * 24 * 60 * 60 * 1000,
    ).length;
    const stats = {
      repositories: repositories.length,
      stars: repositories.reduce((total, repository) => total + repository.stargazers_count, 0),
      forks: repositories.reduce((total, repository) => total + repository.forks_count, 0),
      activeThisMonth,
      commitsLastYear: accountActivity.reduce((sum, week) => sum + week.commits, 0),
      commitsLastFiveWeeks: accountActivity.slice(-5).reduce((sum, week) => sum + week.commits, 0),
      repositoriesWithHistory: activityCandidates.filter(
        (project) => project.history.weeklyActivity !== null,
      ).length,
      hasMore: hasNextLink(response.headers.get("link")),
    };
    return NextResponse.json(
      {
        stats,
        accountActivity,
        projects,
        featuredProjectId: featuredProject?.repository.id ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GitHubCredentialError) {
      return NextResponse.json(
        { code: "GITHUB_RECONNECT_REQUIRED", error: error.message },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
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
