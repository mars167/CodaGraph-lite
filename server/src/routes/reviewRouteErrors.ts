import { ReviewTriggerError } from '../services/ReviewTriggerService';

export interface ReviewRouteErrorResponse {
  statusCode: number;
  error: string;
  details: string;
}

const AUTHORIZATION_ERROR_PATTERN = /重新授权|OAuth token|401 Unauthorized/;

export function resolveReviewRouteError(error: unknown): ReviewRouteErrorResponse {
  const details = error instanceof Error ? error.message : '未知错误';

  if (error instanceof ReviewTriggerError) {
    return {
      statusCode: error.statusCode,
      error: details,
      details,
    };
  }

  if (AUTHORIZATION_ERROR_PATTERN.test(details)) {
    return {
      statusCode: 401,
      error: 'OAuth 授权已失效，请重新授权 GitHub',
      details,
    };
  }

  return {
    statusCode: 500,
    error: '内部服务器错误',
    details,
  };
}
