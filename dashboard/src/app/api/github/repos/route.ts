import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubToken,
  GitHubCredentialError,
  githubJson,
  hasNextLink,
  GitHubApiError,
  GITHUB_CREDENTIAL_COOKIE,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GitHubRepository = {
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

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
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
          error: "Connect a GitHub account in Settings to view repositories.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const path = query
      ? `/search/repositories?q=${encodeURIComponent(`${query} in:name,description`)}&sort=updated&order=desc&per_page=50&page=${requestedPage}`
      : `/user/repos?sort=updated&direction=desc&per_page=50&page=${requestedPage}&affiliation=owner,collaborator,organization_member`;
    const { data, response } = await githubJson<
      GitHubRepository[] | { items: GitHubRepository[]; total_count: number }
    >(token, path);
    const repositories = Array.isArray(data) ? data : data.items;
    return NextResponse.json(
      {
        repositories: repositories.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          visibility: repo.private ? "private" : "public",
          fork: repo.fork,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          defaultBranch: repo.default_branch,
          updatedAt: repo.updated_at,
          pushedAt: repo.pushed_at,
        })),
        page: requestedPage,
        hasMore: hasNextLink(response.headers.get("link")),
        totalCount: Array.isArray(data) ? null : data.total_count,
        query: query || null,
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
      console.error("[github/repos] failed to load repositories:", error);
    }
    return NextResponse.json({ error: getGitHubMessage(error) }, { status });
  }
}
