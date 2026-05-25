'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerApi } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await registerApi({
        email,
        username,
        password,
        displayName: displayName.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell>
        <Card className="text-center">
          <div className="text-3xl mb-4">📬</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            Check your email
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-4">
            We sent a verification link to{' '}
            <strong className="text-[var(--cromo-fg)]">{email}</strong>. Click the link to activate
            your account.
          </p>
          <p className="text-xs text-[var(--cromo-fg-subtle)]">
            Running locally?{' '}
            <a
              href="http://localhost:8025"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--cromo-accent)] hover:underline"
            >
              Open Mailpit
            </a>{' '}
            to view your email.
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="text-sm text-[var(--cromo-accent)] hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="text-center mb-8 flex flex-col items-center">
        <CromoMark size={48} variant="chrome" className="mb-4" />
        <h1 className="font-display font-bold text-2xl text-[var(--cromo-fg)] tracking-tight">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-[var(--cromo-fg-muted)]">
          Already collecting?{' '}
          <Link href="/login" className="text-[var(--cromo-accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="Username"
            htmlFor="username"
            hint="3–30 chars, letters, numbers, dashes, underscores"
          >
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_\-]+"
              autoComplete="username"
              placeholder="collector42"
            />
          </Field>

          <Field label="Display name (optional)" htmlFor="displayName">
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              autoComplete="name"
              placeholder="Your Name"
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <Button type="submit" loading={loading} size="lg" className="mt-2">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[320px] opacity-20 blur-3xl cromo-chrome-fill"
        style={{ maskImage: 'radial-gradient(ellipse at top, black 0%, transparent 70%)' }}
      />
      <div className="w-full max-w-md relative">{children}</div>
    </div>
  );
}
