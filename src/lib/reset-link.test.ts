import { describe, expect, it } from 'vitest';
import { parseResetLink } from './reset-link';

describe('parseResetLink', () => {
  it('recognises the sign-in a reset email carries', () => {
    expect(parseResetLink('#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery'))
      .toEqual({ recovery: true, error: null });
  });

  it('does not treat other sign-ins as a reset', () => {
    expect(parseResetLink('#access_token=abc&refresh_token=def&type=signup')).toEqual({ recovery: false, error: null });
    expect(parseResetLink('#access_token=abc&refresh_token=def&type=magiclink').recovery).toBe(false);
    expect(parseResetLink('').recovery).toBe(false);
  });

  it('needs the token, not just the word', () => {
    expect(parseResetLink('#type=recovery').recovery).toBe(false);
  });

  it('reports an expired or already used link', () => {
    expect(parseResetLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
      .toEqual({ recovery: false, error: 'expired' });
  });

  it('passes other errors through as the server worded them', () => {
    expect(parseResetLink('#error=server_error&error_description=Something+broke').error).toBe('Something broke');
    expect(parseResetLink('#error=server_error').error).toBe('server_error');
    expect(parseResetLink('#error_code=bad_jwt&error_description=Invalid+token').error).toBe('Invalid token');
  });
});
