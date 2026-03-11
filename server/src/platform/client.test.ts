import { GiteeApiClient } from './client';

describe('GiteeApiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to html_url when clone_url is absent on repository details', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        name: 'git-flow-test',
        full_name: 'mars167/git-flow-test',
        owner: {
          login: 'mars167',
          id: 1,
        },
        private: false,
        description: null,
        fork: false,
        language: 'Ruby',
        stargazers_count: 0,
        watchers_count: 0,
        forks_count: 0,
        open_issues_count: 0,
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
        pushed_at: '2026-03-11T00:00:00Z',
        html_url: 'https://gitee.com/mars167/git-flow-test.git',
        ssh_url: 'git@gitee.com:mars167/git-flow-test.git',
        clone_url: null,
        default_branch: 'master',
      }),
    } as Response);

    const client = new GiteeApiClient('token');
    const repository = await client.getRepository('mars167', 'git-flow-test');

    expect(repository.clone_url).toBe('https://gitee.com/mars167/git-flow-test.git');
  });

  it('flattens nested patch objects returned by Gitee pull request files API', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          filename: 'a.rb',
          additions: 1,
          deletions: 0,
          status: null,
          patch: {
            diff: '@@ -1 +1,2 @@\n aaaaaaabbb\n+afasdfasdf\n',
            new_path: 'a.rb',
            old_path: 'a.rb',
            new_file: false,
            renamed_file: false,
            deleted_file: false,
          },
        },
      ]),
    } as Response);

    const client = new GiteeApiClient('token');
    const files = await client.getPullRequestFiles('mars167', 'git-flow-test', 7) as Array<Record<string, unknown>>;

    expect(files[0]).toEqual(expect.objectContaining({
      filename: 'a.rb',
      status: 'modified',
      patch: '@@ -1 +1,2 @@\n aaaaaaabbb\n+afasdfasdf\n',
      diff: '@@ -1 +1,2 @@\n aaaaaaabbb\n+afasdfasdf\n',
      new_path: 'a.rb',
      old_path: 'a.rb',
      new_file: false,
      renamed_file: false,
      deleted_file: false,
    }));
  });

  it('uses merge_requests_events when creating a Gitee webhook', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        url: 'https://example.com/webhook',
        test_url: 'https://example.com/test',
        ping_url: 'https://example.com/ping',
        active: true,
      }),
    } as Response);

    const client = new GiteeApiClient('token');
    await client.createWebhook('mars167', 'git-flow-test', {
      url: 'https://example.com/webhook',
      content_type: 'json',
      secret: 'secret',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitee.com/api/v5/repos/mars167/git-flow-test/hooks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          content_type: 'json',
          password: 'secret',
          push_events: true,
          merge_requests_events: true,
          active: true,
        }),
      })
    );
  });
});
