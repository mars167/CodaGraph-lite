import { isCorsOriginAllowed } from './index';

describe('CORS origin matching', () => {
  it('allows multiple trusted origins from env-style lists', () => {
    expect(isCorsOriginAllowed([
      'http://localhost:3000',
      'https://app.example.com',
    ], 'https://app.example.com')).toBe(true);
  });

  it('normalizes trailing slashes before matching origins', () => {
    expect(isCorsOriginAllowed([
      'https://app.example.com/',
    ], 'https://app.example.com')).toBe(true);
  });

  it('supports wildcard origins', () => {
    expect(isCorsOriginAllowed(['*'], 'https://preview.example.com')).toBe(true);
  });
});
