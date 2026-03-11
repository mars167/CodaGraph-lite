const AUTH_FAILURE_PATTERNS = [
  /(^|[^0-9])401([^0-9]|$)/,
  /bad credentials/i,
  /unauthorized/i,
  /authentication failed/i,
  /invalid username or password/i,
  /could not read username/i,
  /access denied/i,
  /oauth token/i,
  /重新授权/,
];

export function isAuthenticationFailureMessage(message: string): boolean {
  return AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isAuthenticationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isAuthenticationFailureMessage(message);
}
