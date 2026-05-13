'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && user) {
      router.replace('/dashboard');
    }
  }, [hydrated, user, router]);

  if (!hydrated || user) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Stickfolio</h1>
      <p className="mt-2 text-lg text-gray-600">
        2026 FIFA World Cup Panini Sticker Tracker
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Register
        </Link>
      </div>
    </main>
  );
}
