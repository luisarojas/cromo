import { decodeJwt } from 'jose';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import type { Drizzle } from '../db/index.js';
import { users, bannedEmails } from '../db/schema.js';
import type { Redis } from 'ioredis';
import { statusError } from '../utils/errors.js';
import { ensureUser, createUser, deriveUniqueUsernameFromEmail, hashEmail } from './user-provisioning.js';
import { deleteUser } from './cognito-admin.js';
import type { AuthTokens, RegisterInput, LoginInput } from './auth.service.js';

// ─── Cognito client ─────────────────────────────────────────────────────────

let _client: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  _client ??= new CognitoIdentityProviderClient({ region: env.COGNITO_REGION });
  return _client;
}

function clientId(): string {
  if (!env.COGNITO_CLIENT_ID) {
    throw new Error('COGNITO_CLIENT_ID must be set when AUTH_MODE=cognito');
  }
  return env.COGNITO_CLIENT_ID;
}

// Cognito error → HTTP status mapping. Cognito's `name` field carries the
// exception type. We keep messages generic where they could leak account
// existence (login/confirm); the user pool client also has
// prevent_user_existence_errors enabled as a second line of defence.
function mapCognitoError(err: unknown): never {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'UsernameExistsException':
      throw statusError('Email is already registered.', 409);
    case 'InvalidPasswordException':
      throw statusError('Password does not meet the required policy.', 400);
    case 'CodeMismatchException':
      throw statusError('Invalid verification code.', 400);
    case 'ExpiredCodeException':
      throw statusError('Verification code has expired.', 410);
    case 'UserNotConfirmedException':
      throw statusError('Please verify your email address before logging in.', 403);
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      throw statusError('Invalid email or password.', 401);
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      throw statusError('Too many attempts. Please try again later.', 429);
    default:
      throw err;
  }
}

interface IdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  'custom:username'?: string;
  'cognito:groups'?: string[];
}

function deriveUsername(claims: IdClaims): string {
  const fromAttr = claims['custom:username'];
  if (fromAttr && fromAttr.length >= 3) return fromAttr;
  // Fallback for users provisioned outside the register flow (e.g. the
  // Terraform-bootstrapped admin): synthesise from the email local part.
  const local = (claims.email ?? '').split('@')[0]!.replace(/[^a-z0-9_-]/gi, '');
  return local.slice(0, 30).padEnd(3, '0');
}

function roleFromClaims(claims: IdClaims): 'user' | 'admin' {
  return (claims['cognito:groups'] ?? []).includes('admin') ? 'admin' : 'user';
}

async function syncFromIdToken(db: Drizzle, idToken: string): Promise<AuthTokens['user']> {
  const claims = decodeJwt(idToken) as unknown as IdClaims;
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  return ensureUser(db, {
    id: claims.sub,
    email: claims.email ?? '',
    username: deriveUsername(claims),
    role: roleFromClaims(claims),
    emailVerified,
  });
}

// ─── Service surface (mirrors auth.service.ts) ──────────────────────────────

export async function register(
  db: Drizzle,
  _redis: Redis,
  input: RegisterInput,
): Promise<{ userId: string; email: string; username: string }> {
  const email = input.email.toLowerCase().trim();

  const [blocked] = await db.select({ hashedEmail: bannedEmails.hashedEmail }).from(bannedEmails).where(eq(bannedEmails.hashedEmail, hashEmail(email))).limit(1);
  if (blocked) throw statusError('This email address is not eligible for registration.', 403);

  const providedUsername = input.username?.trim();
  let username: string;
  if (providedUsername) {
    username = providedUsername.toLowerCase();
    // Pre-check DB username uniqueness so we fail before creating the Cognito
    // user (Cognito only enforces email uniqueness, not our app username).
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (taken) throw statusError('Username is already taken.', 409);
  } else {
    username = await deriveUniqueUsernameFromEmail(db, email);
  }

  let userSub: string;
  try {
    const res = await client().send(
      new SignUpCommand({
        ClientId: clientId(),
        Username: email,
        Password: input.password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'custom:username', Value: username },
        ],
      }),
    );
    userSub = res.UserSub!;
  } catch (err) {
    mapCognitoError(err);
  }

  // Reserve the username atomically: createUser does a plain insert, so a
  // concurrent duplicate (one that slipped past the pre-check above before
  // either row existed) trips the unique constraint here. On any failure we
  // roll back the just-created Cognito user so the email isn't left orphaned.
  try {
    await createUser(db, { id: userSub, email, username, displayName: input.displayName });
  } catch (err) {
    await deleteUser(userSub).catch(() => {});
    if ((err as { code?: string }).code === '23505') {
      throw statusError('Username is already taken.', 409);
    }
    throw err;
  }

  return { userId: userSub, email, username };
}

export async function login(db: Drizzle, input: LoginInput): Promise<AuthTokens> {
  const email = input.email.toLowerCase().trim();

  let res;
  try {
    res = await client().send(
      new InitiateAuthCommand({
        ClientId: clientId(),
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: input.password },
      }),
    );
  } catch (err) {
    mapCognitoError(err);
  }

  // AdminCreateUser accounts (the bootstrapped admin) come back with a
  // challenge instead of tokens. We don't render a challenge UI — direct the
  // user through the forgot-password flow, which clears FORCE_CHANGE_PASSWORD.
  if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    throw statusError('A new password is required. Use "Forgot password" to set one.', 403);
  }

  const auth = res.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
    throw statusError('Invalid email or password.', 401);
  }

  const user = await syncFromIdToken(db, auth.IdToken);
  return { accessToken: auth.AccessToken, refreshToken: auth.RefreshToken, user };
}

export async function refresh(db: Drizzle, refreshToken: string): Promise<AuthTokens> {
  let res;
  try {
    res = await client().send(
      new InitiateAuthCommand({
        ClientId: clientId(),
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );
  } catch {
    throw statusError('Invalid or expired refresh token.', 401);
  }

  const auth = res.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken) {
    throw statusError('Invalid or expired refresh token.', 401);
  }

  const user = await syncFromIdToken(db, auth.IdToken);
  // REFRESH_TOKEN_AUTH does not rotate the refresh token; re-issue the same one
  // so the caller can refresh the httpOnly cookie's TTL.
  return { accessToken: auth.AccessToken, refreshToken, user };
}

export async function verifyEmail(_db: Drizzle, email: string, code: string): Promise<void> {
  try {
    await client().send(
      new ConfirmSignUpCommand({
        ClientId: clientId(),
        Username: email.toLowerCase().trim(),
        ConfirmationCode: code,
      }),
    );
  } catch (err) {
    mapCognitoError(err);
  }
}

export async function resendVerification(_db: Drizzle, _redis: Redis, email: string): Promise<void> {
  try {
    await client().send(
      new ResendConfirmationCodeCommand({
        ClientId: clientId(),
        Username: email.toLowerCase().trim(),
      }),
    );
  } catch {
    // Anti-enumeration: never surface whether the account exists.
  }
}

export async function forgotPassword(_db: Drizzle, _redis: Redis, email: string): Promise<void> {
  try {
    await client().send(
      new ForgotPasswordCommand({
        ClientId: clientId(),
        Username: email.toLowerCase().trim(),
      }),
    );
  } catch {
    // Anti-enumeration: always respond the same way.
  }
}

export async function resetPassword(
  _db: Drizzle,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  try {
    await client().send(
      new ConfirmForgotPasswordCommand({
        ClientId: clientId(),
        Username: email.toLowerCase().trim(),
        ConfirmationCode: code,
        Password: newPassword,
      }),
    );
  } catch (err) {
    mapCognitoError(err);
  }
}

export async function logout(accessToken: string | undefined): Promise<void> {
  if (!accessToken) return;
  try {
    await client().send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  } catch {
    // Best-effort; the cookie is cleared by the route regardless.
  }
}
