import type { Repository } from '../models/types';

export type RepositoryCoordinates = {
  owner: string;
  repoName: string;
  fullName: string;
};

export function parseRepositoryFullName(
  value: string | null | undefined
): { owner: string; repoName: string } | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const separatorIndex = normalized.lastIndexOf('/');
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }

  return {
    owner: normalized.slice(0, separatorIndex),
    repoName: normalized.slice(separatorIndex + 1),
  };
}

export function resolveRepositoryCoordinates(
  repository: Pick<Repository, 'owner' | 'name' | 'full_name'>
): RepositoryCoordinates {
  const parsed = parseRepositoryFullName(repository.full_name);
  if (parsed) {
    return {
      owner: parsed.owner,
      repoName: parsed.repoName,
      fullName: `${parsed.owner}/${parsed.repoName}`,
    };
  }

  return {
    owner: repository.owner,
    repoName: repository.name,
    fullName: repository.full_name || `${repository.owner}/${repository.name}`,
  };
}
