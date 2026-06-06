import { PageHeader } from '@/components/ui';
import { CHANGELOG, type ChangeCategory } from './entries';

const CATEGORY_TONE: Record<ChangeCategory, string> = {
  Added: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] border-[var(--cromo-success)]/30',
  Changed: 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] border-[var(--cromo-border-strong)]',
  Fixed: 'bg-[var(--cromo-accent)]/10 text-[var(--cromo-accent)] border-[var(--cromo-accent)]/30',
  Removed: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] border-[var(--cromo-danger)]/30',
  Security: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] border-[var(--cromo-danger)]/30',
};

const CATEGORY_ORDER: ChangeCategory[] = ['Added', 'Changed', 'Fixed', 'Removed', 'Security'];

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <PageHeader
        eyebrow="Changelog"
        title="What's New"
        subtitle="Notable changes shipped to Cromo, newest first."
      />

      <div className="space-y-6">
        {CHANGELOG.map((entry) => {
          const formatted = formatDate(entry.date);
          const isUnreleased = entry.version === 'Unreleased';
          return (
            <article
              key={entry.version}
              className="rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-6 py-5"
            >
              <header className="flex items-baseline gap-3 flex-wrap mb-4">
                <h2 className="font-display text-xl font-bold tracking-tight text-[var(--cromo-fg)]">
                  {entry.version}
                </h2>
                {formatted && (
                  <span className="text-xs font-mono text-[var(--cromo-fg-subtle)]">{formatted}</span>
                )}
                {isUnreleased && (
                  <span className="inline-flex items-center rounded-full border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cromo-fg-muted)]">
                    Unreleased
                  </span>
                )}
                {entry.deprecated && (
                  <span className="inline-flex items-center rounded-full border border-[var(--cromo-warning)]/40 bg-[var(--cromo-warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cromo-warning-text)]">
                    Known broken
                  </span>
                )}
              </header>

              {entry.deprecated && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-[var(--cromo-warning)]/40 bg-[var(--cromo-warning-soft)] px-3 py-2 text-sm text-[var(--cromo-warning-text)] flex gap-2 items-start"
                >
                  <span aria-hidden className="mt-0.5">⚠️</span>
                  <p className="leading-relaxed">{entry.deprecated}</p>
                </div>
              )}

              <div className="space-y-4">
                {CATEGORY_ORDER.filter((cat) => entry.changes[cat]?.length).map((cat) => (
                  <div key={cat}>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mb-2 ${CATEGORY_TONE[cat]}`}
                    >
                      {cat}
                    </span>
                    <ul className="list-disc list-outside pl-5 space-y-1 text-sm text-[var(--cromo-fg)] leading-relaxed">
                      {entry.changes[cat]!.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
