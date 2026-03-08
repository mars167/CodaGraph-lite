import { ReviewTriggerError } from '../services/ReviewTriggerService';
import { isAuthenticationFailureMessage } from '../utils/authFailures';

export interface ReviewRouteErrorResponse {
  statusCode: number;
  error: string;
  details: string;
}

export function resolveReviewRouteError(error: unknown): ReviewRouteErrorResponse {
  const details = error instanceof Error ? error.message : '未知错误';

  if (error instanceof ReviewTriggerError) {
    return {
      statusCode: error.statusCode,
      error: details,
      details,
    };
  }

  if (isAuthenticationFailureMessage(details)) {
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
