import path from 'node:path';

export interface NormalizedGithubRepo {
  cloneUrl: string;
  owner: string;
  repo: string;
}

const SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

/** Parse public GitHub repo URLs for shallow clone (v1: github.com only). */
export function normalizeGithubRepoUrl(input: string): NormalizedGithubRepo | null {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) return null;

  let owner = '';
  let repo = '';

  const short = raw.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/);
  if (short) {
    owner = short[1]!;
    repo = short[2]!.replace(/\.git$/i, '');
  } else {
    const https = raw.match(
      /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?(?:\/.*)?$/i
    );
    if (https) {
      owner = https[1]!;
      repo = https[2]!;
    }
  }

  if (!owner || !repo || !SEGMENT_RE.test(owner) || !SEGMENT_RE.test(repo)) {
    return null;
  }

  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

export function repoTargetPath(parentDir: string, repo: string): string {
  return path.join(parentDir, repo);
}
