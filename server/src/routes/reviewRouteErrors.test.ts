import { ReviewTriggerError } from '../services/ReviewTriggerService';
import { resolveReviewRouteError } from './reviewRouteErrors';

describe('resolveReviewRouteError', () => {
  it('preserves explicit ReviewTriggerError status codes and messages', () => {
    const response = resolveReviewRouteError(new ReviewTriggerError('仓库不存在', 404));

    expect(response).toEqual({
      statusCode: 404,
      error: '仓库不存在',
      details: '仓库不存在',
    });
  });

  it('maps auth failures to 401 with a user-facing oauth message', () => {
    const response = resolveReviewRouteError(new Error('GET /pulls 失败: 401 Unauthorized'));

    expect(response).toEqual({
      statusCode: 401,
      error: 'OAuth 授权已失效，请重新授权 GitHub',
      details: 'GET /pulls 失败: 401 Unauthorized',
    });
  });

  it('falls back to 500 for unexpected errors', () => {
    const response = resolveReviewRouteError(new Error('queue unavailable'));

    expect(response).toEqual({
      statusCode: 500,
      error: '内部服务器错误',
      details: 'queue unavailable',
    });
  });
});
