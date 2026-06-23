import { describe, it, expect, vi, beforeEach } from 'vitest';

// All Cognito SDK commands are constructor-name-tagged so the test can assert
// on which command the service sent without binding to argument shapes.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class CognitoIdentityProviderClient { send = sendMock; }
  class SignUpCommand                  { constructor(public input: unknown) {} }
  class ConfirmSignUpCommand           { constructor(public input: unknown) {} }
  class ResendConfirmationCodeCommand  { constructor(public input: unknown) {} }
  class InitiateAuthCommand            { constructor(public input: unknown) {} }
  class ForgotPasswordCommand          { constructor(public input: unknown) {} }
  class ConfirmForgotPasswordCommand   { constructor(public input: unknown) {} }
  class GlobalSignOutCommand           { constructor(public input: unknown) {} }
  return {
    CognitoIdentityProviderClient,
    SignUpCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand,
    InitiateAuthCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand,
    GlobalSignOutCommand,
  };
});

// jose's decodeJwt is used inside syncFromIdToken; we control its return value.
const { decodeJwtMock } = vi.hoisted(() => ({ decodeJwtMock: vi.fn() }));
vi.mock('jose', () => ({ decodeJwt: decodeJwtMock }));

// Stub user-provisioning so we don't touch the DB.
const { ensureUserMock, createUserMock, deriveUniqueUsernameFromEmailMock, hashEmailForBanMock } = vi.hoisted(() => ({
  ensureUserMock: vi.fn(),
  createUserMock: vi.fn(),
  deriveUniqueUsernameFromEmailMock: vi.fn(),
  hashEmailForBanMock: vi.fn(),
}));
vi.mock('../../src/services/user-provisioning.js', () => ({
  ensureUser: ensureUserMock,
  createUser: createUserMock,
  deriveUniqueUsernameFromEmail: deriveUniqueUsernameFromEmailMock,
  hashEmailForBan: hashEmailForBanMock,
}));

// cognito-admin.deleteUser is called as compensation when createUser fails.
const { adminDeleteUserMock } = vi.hoisted(() => ({ adminDeleteUserMock: vi.fn() }));
vi.mock('../../src/services/cognito-admin.js', () => ({ deleteUser: adminDeleteUserMock }));

vi.mock('../../src/env.js', () => ({
  env: {
    COGNITO_REGION: 'ca-central-1',
    COGNITO_USER_POOL_ID: 'ca-central-1_TEST',
    COGNITO_CLIENT_ID: 'client-1',
  },
}));

// Stub the pg Pool used by the service. Each call to db.query is dispatched
// by the first SQL keyword that follows FROM — `banned_emails` vs `users` —
// so the test can route queries to the right canned response without parsing
// parameters.
function makePool(banRows: unknown[] = [], usernameRows: unknown[] = []) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM banned_emails')) return { rows: banRows };
    if (sql.includes('FROM users')) return { rows: usernameRows };
    return { rows: [] };
  });
  return { query } as unknown as Parameters<typeof import('../../src/services/cognito-auth.service.js').register>[0];
}

import {
  register, login, refresh, verifyEmail, resendVerification,
  forgotPassword, resetPassword, logout,
} from '../../src/services/cognito-auth.service.js';

beforeEach(() => {
  sendMock.mockReset();
  decodeJwtMock.mockReset();
  ensureUserMock.mockReset();
  createUserMock.mockReset();
  deriveUniqueUsernameFromEmailMock.mockReset();
  hashEmailForBanMock.mockReset().mockReturnValue('banhash');
  adminDeleteUserMock.mockReset().mockResolvedValue(undefined);
});

// ── register ────────────────────────────────────────────────────────────────

describe('register', () => {
  it('rejects with 403 when the canonicalised email is on the banned list', async () => {
    const db = makePool([{ hashed_email: 'banhash' }]); // bannedEmails row present
    await expect(
      register(db, {} as never, { email: 'x@y.z', password: 'pw', username: 'newuser' } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects with 409 when the requested username is already taken in our DB', async () => {
    const db = makePool([], [{ id: 'someone-else' }]);
    await expect(
      register(db, {} as never, { email: 'x@y.z', password: 'pw', username: 'taken' } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('derives a username when none is provided and propagates the SignUp UserSub', async () => {
    deriveUniqueUsernameFromEmailMock.mockResolvedValue('derived');
    sendMock.mockResolvedValueOnce({ UserSub: 'sub-1' }); // SignUpCommand
    createUserMock.mockResolvedValue(undefined);
    const db = makePool();
    const out = await register(db, {} as never, { email: 'x@y.z', password: 'pw' } as never);
    expect(out).toEqual({ userId: 'sub-1', email: 'x@y.z', username: 'derived' });
    // SignUpCommand was sent.
    expect((sendMock.mock.calls[0]![0] as { constructor: { name: string } }).constructor.name).toBe('SignUpCommand');
    expect(createUserMock).toHaveBeenCalledWith(db, expect.objectContaining({
      id: 'sub-1', email: 'x@y.z', username: 'derived',
    }));
  });

  it('rolls back the Cognito user when createUser hits a unique-constraint race', async () => {
    sendMock.mockResolvedValueOnce({ UserSub: 'sub-2' });
    createUserMock.mockRejectedValueOnce(Object.assign(new Error('unique violation'), { code: '23505' }));
    const db = makePool();
    await expect(
      register(db, {} as never, { email: 'x@y.z', password: 'pw', username: 'whoops' } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
    // Compensation: the just-created Cognito user is removed.
    expect(adminDeleteUserMock).toHaveBeenCalledWith('sub-2');
  });

  it('maps Cognito UsernameExistsException to a 409 with a generic message', async () => {
    sendMock.mockRejectedValueOnce({ name: 'UsernameExistsException' });
    const db = makePool();
    await expect(
      register(db, {} as never, { email: 'x@y.z', password: 'pw', username: 'newuser' } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('maps InvalidPasswordException to 400', async () => {
    sendMock.mockRejectedValueOnce({ name: 'InvalidPasswordException' });
    const db = makePool();
    await expect(
      register(db, {} as never, { email: 'x@y.z', password: 'pw', username: 'newuser' } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── login ───────────────────────────────────────────────────────────────────

describe('login', () => {
  it('returns AuthenticationResult tokens + synced user on success', async () => {
    sendMock.mockResolvedValueOnce({
      AuthenticationResult: { AccessToken: 'a', IdToken: 'i', RefreshToken: 'r' },
    });
    decodeJwtMock.mockReturnValue({ sub: 'sub-3', email: 'x@y.z', email_verified: true });
    ensureUserMock.mockResolvedValue({ id: 'sub-3', email: 'x@y.z', username: 'syncd' });

    const out = await login({} as never, { email: 'x@y.z', password: 'pw' } as never);
    expect(out).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    expect(out.user).toEqual({ id: 'sub-3', email: 'x@y.z', username: 'syncd' });
  });

  it('throws 403 when Cognito returns a NEW_PASSWORD_REQUIRED challenge', async () => {
    sendMock.mockResolvedValueOnce({ ChallengeName: 'NEW_PASSWORD_REQUIRED' });
    await expect(login({} as never, { email: 'x@y.z', password: 'pw' } as never)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('maps Cognito NotAuthorizedException to a generic 401 (anti-enumeration)', async () => {
    sendMock.mockRejectedValueOnce({ name: 'NotAuthorizedException' });
    await expect(login({} as never, { email: 'x@y.z', password: 'pw' } as never)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('maps UserNotConfirmedException to 403 with the "verify email" message', async () => {
    sendMock.mockRejectedValueOnce({ name: 'UserNotConfirmedException' });
    await expect(login({} as never, { email: 'x@y.z', password: 'pw' } as never)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/verify your email/i),
    });
  });

  it('throws 401 when Cognito returns success but no tokens', async () => {
    sendMock.mockResolvedValueOnce({ AuthenticationResult: {} });
    await expect(login({} as never, { email: 'x@y.z', password: 'pw' } as never)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

// ── refresh ─────────────────────────────────────────────────────────────────

describe('refresh', () => {
  it('returns new access token + the SAME refresh token on success', async () => {
    sendMock.mockResolvedValueOnce({ AuthenticationResult: { AccessToken: 'new-a', IdToken: 'new-i' } });
    decodeJwtMock.mockReturnValue({ sub: 'sub-r', email: 'x@y.z' });
    ensureUserMock.mockResolvedValue({ id: 'sub-r' });
    const out = await refresh({} as never, 'original-refresh');
    expect(out.accessToken).toBe('new-a');
    expect(out.refreshToken).toBe('original-refresh');
  });

  it('throws 401 on a thrown Cognito error', async () => {
    sendMock.mockRejectedValueOnce(new Error('boom'));
    await expect(refresh({} as never, 'r')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 when Cognito returns no AuthenticationResult', async () => {
    sendMock.mockResolvedValueOnce({});
    await expect(refresh({} as never, 'r')).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── verifyEmail / resendVerification ───────────────────────────────────────

describe('verifyEmail', () => {
  it('succeeds when Cognito accepts the ConfirmSignUp call', async () => {
    sendMock.mockResolvedValueOnce({});
    await expect(verifyEmail({} as never, 'x@y.z', '123456')).resolves.toBeUndefined();
    const cmd = sendMock.mock.calls[0]![0] as { constructor: { name: string } };
    expect(cmd.constructor.name).toBe('ConfirmSignUpCommand');
  });

  it('maps CodeMismatchException to 400', async () => {
    sendMock.mockRejectedValueOnce({ name: 'CodeMismatchException' });
    await expect(verifyEmail({} as never, 'x@y.z', 'bad')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps ExpiredCodeException to 410', async () => {
    sendMock.mockRejectedValueOnce({ name: 'ExpiredCodeException' });
    await expect(verifyEmail({} as never, 'x@y.z', 'old')).rejects.toMatchObject({ statusCode: 410 });
  });
});

describe('resendVerification', () => {
  it('always resolves (anti-enumeration), even when Cognito throws', async () => {
    sendMock.mockRejectedValueOnce({ name: 'UserNotFoundException' });
    await expect(resendVerification({} as never, {} as never, 'x@y.z')).resolves.toBeUndefined();
  });
});

// ── forgotPassword / resetPassword ──────────────────────────────────────────

describe('forgotPassword', () => {
  it('swallows the Cognito error (anti-enumeration)', async () => {
    sendMock.mockRejectedValueOnce({ name: 'UserNotFoundException' });
    await expect(forgotPassword({} as never, {} as never, 'x@y.z')).resolves.toBeUndefined();
  });
});

describe('resetPassword', () => {
  it('maps CodeMismatchException to 400', async () => {
    sendMock.mockRejectedValueOnce({ name: 'CodeMismatchException' });
    await expect(resetPassword({} as never, 'x@y.z', 'bad', 'newpw')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('succeeds when ConfirmForgotPassword accepts the code', async () => {
    sendMock.mockResolvedValueOnce({});
    await expect(resetPassword({} as never, 'x@y.z', '123456', 'newpw')).resolves.toBeUndefined();
  });
});

// ── logout ──────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('is a no-op when no access token is provided', async () => {
    await logout(undefined);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends GlobalSignOutCommand with the access token', async () => {
    sendMock.mockResolvedValueOnce({});
    await logout('access-tok');
    const cmd = sendMock.mock.calls[0]![0] as { constructor: { name: string } };
    expect(cmd.constructor.name).toBe('GlobalSignOutCommand');
  });

  it('swallows Cognito errors so cookie clearing always proceeds in the route', async () => {
    sendMock.mockRejectedValueOnce(new Error('signed out elsewhere'));
    await expect(logout('access-tok')).resolves.toBeUndefined();
  });
});
