import { GiteeClient } from './GitHubClient';

describe('GiteeClient', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('retries transient fetch failures when posting a summary comment', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((callback: any) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as any;
    }) as any);

    const fetchMock = jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
      } as Response);

    const client = new GiteeClient('token');
    await client.postComment(
      {
        platform: 'gitee',
        owner: 'mars167',
        repo: 'git-flow-test',
        prNumber: '7',
      },
      {
        body: 'hello',
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalled();
  });
});
