import { redirect } from 'next/navigation';

// The backend mints share URLs as `${FRONTEND_URL}/join/<code>`; we redirect
// the path-segment form to the form-bearing `/join?code=...` so the actual
// join logic lives in one place.

interface Params { params: Promise<{ code: string }> }

export default async function JoinByCode({ params }: Params) {
  const { code } = await params;
  redirect(`/join?code=${encodeURIComponent(code)}`);
}
