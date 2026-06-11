import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Terms of Service — Cromo',
  description: 'The terms that govern your use of Cromo.',
  alternates: { canonical: '/terms' },
};

const LAST_UPDATED = '2026-06-10';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <PageHeader
        eyebrow="Legal"
        title="Terms of Service"
        subtitle={`Last updated: ${LAST_UPDATED}`}
      />

      <article className="space-y-6 text-sm leading-relaxed text-[var(--cromo-fg)]">
        <Section title="1. Acceptance">
          <p>
            By creating a Cromo account or using the Cromo service (the
            &quot;Service&quot;), you agree to these Terms of Service. If you do not
            agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. What Cromo is">
          <p>
            Cromo is a peer-to-peer platform that helps collectors of the FIFA World
            Cup 2026 Panini sticker collection track their albums and arrange trades
            with other collectors. Cromo is an independent platform and is not
            affiliated with, endorsed by, or sponsored by Panini, FIFA, or any
            national football federation.
          </p>
        </Section>

        <Section title="3. Eligibility and accounts">
          <p>
            You must be at least 13 years old (or the age of digital consent in your
            jurisdiction) to use Cromo. You are responsible for keeping your account
            credentials secure and for all activity that takes place under your
            account. Notify us promptly at{' '}
            <a className="underline" href="mailto:support@cromotrade.ca">
              support@cromotrade.ca
            </a>{' '}
            if you suspect unauthorised use.
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the Service for any unlawful purpose.</li>
            <li>
              Harass, threaten, or impersonate other users; post content that is
              hateful, sexually explicit, or otherwise harmful.
            </li>
            <li>
              Spam, scrape, or attempt to disrupt the Service or other users&apos;
              accounts.
            </li>
            <li>
              Misrepresent the condition, identity, or ownership of stickers offered
              in a trade.
            </li>
            <li>
              Attempt to reverse-engineer, probe, or circumvent the security of the
              Service.
            </li>
          </ul>
          <p>
            We may suspend or terminate accounts that violate these rules, with or
            without notice depending on severity.
          </p>
        </Section>

        <Section title="5. Trades between users">
          <p>
            Trades arranged through Cromo are agreements between the participating
            users. Cromo provides matching, messaging, and rating tools but is not a
            party to any trade and does not hold inventory, escrow payments, or
            guarantee delivery. Each user is responsible for arranging shipping,
            packaging, and any costs associated with completing the trade.
          </p>
          <p>
            You are responsible for complying with the laws and postal regulations
            of your jurisdiction and the other user&apos;s jurisdiction, including
            any applicable customs or import duties.
          </p>
        </Section>

        <Section title="6. Your content">
          <p>
            You retain ownership of any content you submit to Cromo (collection
            entries, messages, ratings, avatar). You grant Cromo a worldwide,
            non-exclusive, royalty-free licence to host, display, and transmit that
            content for the sole purpose of operating the Service. You are
            responsible for the content you submit and confirm that you have the
            right to submit it.
          </p>
        </Section>

        <Section title="7. Communication and email">
          <p>
            By creating an account you consent to receive transactional email from
            Cromo that is necessary to operate the Service (account verification,
            password reset, trade notifications). You may opt out of optional
            notification emails at any time from{' '}
            <strong>Settings → Email preferences</strong>. We do not send
            promotional or marketing email unless you have explicitly opted in.
          </p>
        </Section>

        <Section title="8. Intellectual property">
          <p>
            The Cromo name, logo, and website design are property of the Cromo team.
            Sticker names, player names, team names, and other third-party marks
            displayed on Cromo are the property of their respective owners and are
            used only for purposes of identifying the items being tracked or traded.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot;.
            To the maximum extent permitted by law, Cromo disclaims all warranties,
            express or implied, including merchantability and fitness for a
            particular purpose. We do not guarantee that the Service will be
            uninterrupted, error-free, or that any defects will be corrected.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Cromo will not be liable for any
            indirect, incidental, special, consequential, or punitive damages
            arising out of or related to your use of the Service. Our total
            cumulative liability for any claim related to the Service will not
            exceed the amount you paid Cromo in the 12 months preceding the claim
            (which, for the free tier, is zero).
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            You may delete your account at any time from{' '}
            <strong>Settings → Account</strong>. We may suspend or terminate
            accounts that violate these Terms. On termination, your right to use
            the Service ends; the provisions that by their nature should survive
            (intellectual property, disclaimers, limitation of liability) will
            continue to apply.
          </p>
        </Section>

        <Section title="12. Changes to these Terms">
          <p>
            We may update these Terms from time to time. Material changes will be
            announced in the in-app changelog and reflected in the &quot;last
            updated&quot; date above. Continuing to use the Service after a change
            constitutes acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="13. Governing law">
          <p>
            These Terms are governed by the laws of the Province of Ontario, Canada,
            without regard to its conflict-of-law principles. Disputes will be
            resolved in the courts located in Ontario, except where mandatory
            consumer-protection laws of your jurisdiction require otherwise.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these Terms can be sent to{' '}
            <a className="underline" href="mailto:support@cromotrade.ca">
              support@cromotrade.ca
            </a>
            .
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold tracking-tight text-[var(--cromo-fg)]">
        {title}
      </h2>
      <div className="space-y-2 text-[var(--cromo-fg-muted)]">{children}</div>
    </section>
  );
}
