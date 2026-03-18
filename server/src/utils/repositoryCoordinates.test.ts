import { parseRepositoryFullName, resolveRepositoryCoordinates } from './repositoryCoordinates';

describe('repositoryCoordinates', () => {
  it('parses repository full name using the last slash for nested namespaces', () => {
    expect(parseRepositoryFullName('group/subgroup/project')).toEqual({
      owner: 'group/subgroup',
      repoName: 'project',
    });
  });

  it('falls back to stored owner and name when full_name is invalid', () => {
    expect(resolveRepositoryCoordinates({
      owner: 'mars167',
      name: 'CodaGraph-lite',
      full_name: 'invalid-full-name',
    })).toEqual({
      owner: 'mars167',
      repoName: 'CodaGraph-lite',
      fullName: 'invalid-full-name',
    });
  });

  it('prefers canonical coordinates derived from full_name', () => {
    expect(resolveRepositoryCoordinates({
      owner: 'mars167',
      name: 'API REIVEW  PRO1',
      full_name: 'api-review-test-group/api-reivew-pro1',
    })).toEqual({
      owner: 'api-review-test-group',
      repoName: 'api-reivew-pro1',
      fullName: 'api-review-test-group/api-reivew-pro1',
    });
  });
});
