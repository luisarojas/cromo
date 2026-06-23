import { apiFetch } from '../apiClient';
import type { UserPreferences } from './types';

export async function fetchUserPreferences(token: string): Promise<UserPreferences> {
  return apiFetch<UserPreferences>('/api/v1/users/me/preferences', {}, token);
}

export async function patchUserPreferences(
  patch: Partial<UserPreferences>,
  token: string,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>(
    '/api/v1/users/me/preferences',
    { method: 'PATCH', body: JSON.stringify(patch) },
    token,
  );
}
