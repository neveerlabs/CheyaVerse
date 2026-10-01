import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubToken,
  githubFetch,
  githubJson,
  GitHubApiError,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Repository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  size: number;
  archived: boolean;
  disabled: boolean;
};

type Deployment = {
  id: number;
  environment: string;
  created_at: string;
  sha: string;
  ref: string;
  task: string;
  description: string | null;
};

type DeploymentStatus = {
  state: string;
  environment_url: string | null;
  log_url: string | null;
  created_at: string;
};

type WorkflowRuns = {
  total_count: number;
  workflow_runs: Array<{
    id: number;
    name: string;
    html_url: string;
    head_branch: string;
    head_sha: string;
    status: string;
    conclusion: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

type TrafficViews = {
  count: number;
  uniques: number;
  views: Array<{ timestamp: string; count: number; uniques: number }>;
};

type TrafficClones = {
  count: number;
  uniques: number;
  clones: Array<{ timestamp: string; count: number; uniques: number }>;
};

type TrafficReferrer = {
  referrer: string;
  count: number;
  uniques: number;
};

type TrafficPath = {
  path: string;
  title: string;
  count: number;
  uniques: number;
};

function validSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";
}

async function optionalJson<T>(
  token: string,
  path: string,
  fallback: T,
): Promise<T> {
  const response = await githubFetch(token, path);
  if (response.status === 403 || response.status === 404) return fallback;
  if (!response.ok) {
    const error = new Error("Optional GitHub data request failed.");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return (await response.json()) as T;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { owner, repo } = params;
  if (!validSegment(owner) || !validSegment(repo)) {
    return NextResponse.json({ error: "Invalid repository path." }, { status: 400 });
  }

  try {
    const token = await getGitHubToken(session.uid);
    if (!token) {
      return NextResponse.json(
        { error: "Connect a GitHub account in Settings to view repositories." },
        { status: 409 },
      );
    }
    const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const [
      repositoryResult,
      branches,
      languages,
      deployments,
      workflows,
      trafficViews,
      trafficClones,
      topReferrers,
      popularPaths,
    ] = await Promise.all([
      githubJson<Repository>(token, repoPath),
      githubJson<Array<{ name: string; protected: boolean }>>(
        token,
        `${repoPath}/branches?per_page=100`,
      ).then(({ data }) => data),
      githubJson<Record<string, number>>(token, `${repoPath}/languages`).then(
        ({ data }) => data,
      ),
      optionalJson<Deployment[]>(
        token,
        `${repoPath}/deployments?per_page=20`,
        [],
      ),
      optionalJson<WorkflowRuns>(
        token,
        `${repoPath}/actions/runs?per_page=8`,
        { total_count: 0, workflow_runs: [] },
      ),
      optionalJson<TrafficViews>(token, `${repoPath}/traffic/views`, {
        count: 0,
        uniques: 0,
        views: [],
      }),
      optionalJson<TrafficClones>(token, `${repoPath}/traffic/clones`, {
        count: 0,
        uniques: 0,
        clones: [],
      }),
      optionalJson<TrafficReferrer[]>(
        token,
        `${repoPath}/traffic/popular/referrers`,
        [],
      ),
      optionalJson<TrafficPath[]>(
        token,
        `${repoPath}/traffic/popular/paths`,
        [],
      ),
    ]);
    const { data: repository } = repositoryResult;
    if (repository.full_name.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) {
      return NextResponse.json({ error: "Repository was not found." }, { status: 404 });
    }

    const productionDeployment = deployments
      .filter((deployment) => deployment.environment.toLowerCase() === "production")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    const deploymentForStatus = productionDeployment ?? deployments[0] ?? null;
    let productionStatus: DeploymentStatus | null = null;
    if (deploymentForStatus) {
      productionStatus = await optionalJson<DeploymentStatus[]>(
        token,
        `${repoPath}/deployments/${deploymentForStatus.id}/statuses?per_page=1`,
        [],
      ).then((statuses) => statuses[0] ?? null);
    }

    return NextResponse.json(
      {
        repository: {
          id: repository.id,
          name: repository.name,
          fullName: repository.full_name,
          url: repository.html_url,
          visibility: repository.private ? "private" : "public",
          description: repository.description,
          createdAt: repository.created_at,
          updatedAt: repository.updated_at,
          pushedAt: repository.pushed_at,
          defaultBranch: repository.default_branch,
          stars: repository.stargazers_count,
          forks: repository.forks_count,
          openIssues: repository.open_issues_count,
          language: repository.language,
          sizeKb: repository.size,
          archived: repository.archived,
          disabled: repository.disabled,
        },
        branches,
        languages,
        deployments: deployments.slice(0, 8),
        production: deploymentForStatus
          ? {
              environment: deploymentForStatus.environment,
              createdAt: deploymentForStatus.created_at,
              sha: deploymentForStatus.sha,
              ref: deploymentForStatus.ref,
              state: productionStatus?.state ?? "unknown",
              url: productionStatus?.environment_url ?? null,
              logUrl: productionStatus?.log_url ?? null,
            }
          : null,
        workflows: workflows.workflow_runs,
        traffic:
          trafficViews.views.length ||
          trafficClones.clones.length ||
          topReferrers.length ||
          popularPaths.length
          ? {
              views: trafficViews.count,
              uniqueVisitors: trafficViews.uniques,
              days: trafficViews.views,
              clones: trafficClones.count,
              uniqueCloners: trafficClones.uniques,
              cloneDays: trafficClones.clones,
              referrers: topReferrers,
              popularPaths,
            }
          : null,
        trafficUnavailableMessage:
          !trafficViews.views.length &&
          !trafficClones.clones.length &&
          !topReferrers.length &&
          !popularPaths.length
            ? "GitHub only provides aggregate traffic for the last 14 days and requires write access to the repository."
            : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof GitHubApiError
        ? error.status
        : Number((error as { status?: unknown })?.status) || 502;
    if (!(error instanceof GitHubApiError)) {
      console.error("[github/repo] failed to load repository details:", error);
    }
    return NextResponse.json({ error: getGitHubMessage(error) }, { status });
  }
}
