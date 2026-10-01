import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubToken,
  githubJson,
  GitHubApiError,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GitTree = {
  sha: string;
  truncated: boolean;
  tree: Array<{
    path: string;
    type: "blob" | "tree" | "commit";
    size?: number;
    sha: string;
  }>;
};

type GitBranch = {
  commit: {
    commit: {
      tree: {
        sha: string;
      };
    };
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string } },
) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const branch = request.nextUrl.searchParams.get("branch");
  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(params.owner) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(params.repo) ||
    !branch ||
    branch.length > 255
  ) {
    return NextResponse.json({ error: "Invalid repository or branch." }, { status: 400 });
  }
  try {
    const token = await getGitHubToken(session.uid);
    if (!token) {
      return NextResponse.json({ error: "Connect GitHub in Settings first." }, { status: 409 });
    }
    const repoPath = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`;
    const { data: branchInfo } = await githubJson<GitBranch>(
      token,
      `${repoPath}/branches/${encodeURIComponent(branch)}`,
    );
    const { data } = await githubJson<GitTree>(
      token,
      `${repoPath}/git/trees/${encodeURIComponent(branchInfo.commit.commit.tree.sha)}?recursive=1`,
    );
    return NextResponse.json(
      {
        sha: data.sha,
        truncated: data.truncated || data.tree.length > 1000,
        totalEntries: data.tree.length,
        entries: data.tree.slice(0, 1000).map(({ path, type, size, sha }) => ({
          path,
          type,
          size: size ?? null,
          sha,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof GitHubApiError ? error.status : 502;
    if (!(error instanceof GitHubApiError)) {
      console.error("[github/tree] failed to load project structure:", error);
    }
    return NextResponse.json({ error: getGitHubMessage(error) }, { status });
  }
}
