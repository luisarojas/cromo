import { retryFetch, BASE_URL } from '../apiClient';
import type { AuthUser } from './types';

export async function loginApi(
  email: string,
  password: string,
): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Login failed');
  }
  return res.json() as Promise<{ accessToken: string; user: AuthUser }>;
}

export async function refreshApi(): Promise<{ accessToken: string; user: AuthUser } | null> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = await res.json() as { authenticated: boolean; accessToken?: string; user?: AuthUser };
  if (!data.authenticated) return null;
  return { accessToken: data.accessToken!, user: data.user! };
}

export async function logoutApi(): Promise<void> {
  await retryFetch(`${BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function registerApi(body: {
  email: string;
  username?: string;
  password: string;
  displayName?: string;
}): Promise<{ message: string; userId: string }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Registration failed');
  }
  return res.json() as Promise<{ message: string; userId: string }>;
}

export async function verifyEmailApi(email: string, code: string): Promise<void> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    const err = new Error(data.message ?? 'Verification failed') as Error & {
      statusCode?: number;
    };
    err.statusCode = res.status;
    throw err;
  }
}

export async function resendVerificationApi(email: string): Promise<void> {
  await retryFetch(`${BASE_URL}/api/v1/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function forgotPasswordApi(email: string): Promise<void> {
  await retryFetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPasswordApi(email: string, code: string, password: string): Promise<void> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    const err = new Error(data.message ?? 'Password reset failed') as Error & {
      statusCode?: number;
    };
    err.statusCode = res.status;
    throw err;
  }
}

export async function updateUsernameApi(
  username: string,
  token: string,
): Promise<{ username: string }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/username`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update username');
  }
  return res.json() as Promise<{ username: string }>;
}

export async function updateDisplayNameApi(
  displayName: string | null,
  token: string,
): Promise<{ displayName: string | null }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/display-name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update display name');
  }
  return res.json() as Promise<{ displayName: string | null }>;
}

export async function updateEmailApi(
  email: string,
  token: string,
): Promise<{ email: string }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/email`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update email');
  }
  return res.json() as Promise<{ email: string }>;
}

export async function updatePasswordApi(
  currentPassword: string,
  newPassword: string,
  token: string,
): Promise<void> {
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update password');
  }
}

export async function deleteAccountApi(token: string): Promise<void> {
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to delete account');
  }
}
