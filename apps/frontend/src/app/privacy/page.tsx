import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Privacy Policy — Cromo',
  description: 'How Cromo collects, uses, and protects personal information.',
  alternates: { canonical: '/privacy' },
};

const LAST_UPDATED = '2026-06-10';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle={`Last updated: ${LAST_UPDATED}`}
      />

      <article className="prose-cromo space-y-6 text-sm leading-relaxed text-[var(--cromo-fg)]">
        <Section title="1. Who we are">
          <p>
            Cromo is a sticker-trading platform for collectors of the FIFA World Cup 2026
            Panini sticker collection. The service is operated from Canada by the Cromo
            team. We can be reached at{' '}
            <a className="underline" href="mailto:support@cromotrade.ca">support@cromotrade.ca</a>.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p>
            We only collect information you provide to us directly or that is strictly
            necessary to operate the service:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Account information.</strong> Your email address, chosen username,
              display name, optional avatar, and the language and locale you prefer.
            </li>
            <li>
              <strong>Collection data.</strong> The stickers, albums, and trade
              preferences you record in your account.
            </li>
            <li>
              <strong>City-level location.</strong> Cities you choose to associate with
              your profile so the trade-matching feature can rank nearby collectors.
              We store only the city label and its approximate coordinates — never
              your device GPS.
            </li>
            <li>
              <strong>Trade activity.</strong> Trade offers, ratings, and messages you
              exchange with other users on the platform.
            </li>
            <li>
              <strong>Operational logs.</strong> IP address, user-agent, and timestamps
              of requests, kept for a short retention window for security and abuse
              prevention.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> use third-party advertising trackers, marketing
            pixels, or behavioural analytics SDKs.
          </p>
        </Section>

        <Section title="3. How we use your information">
          <p>We use your information solely to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide the trading service and your account.</li>
            <li>
              Send transactional emails strictly related to actions you initiated:
              account verification, password reset, and notifications about trades you
              are a party to.
            </li>
            <li>Detect and prevent fraud, abuse, and platform-level safety issues.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p>
            We do not send marketing or promotional email, and we do not sell or rent
            personal information to third parties.
          </p>
        </Section>

        <Section title="4. Email and your inbox">
          <p>
            Every email Cromo sends is transactional and triggered by an action you
            took (registering, requesting a password reset, or trading with another
            user). You can disable optional trade notifications at any time from{' '}
            <strong>Settings → Email preferences</strong>, or by replying with
            &quot;unsubscribe&quot; to any optional notification email. Account
            verification and password reset emails remain enabled while your account
            is active because they are required for security.
          </p>
          <p>
            Outgoing mail is delivered through Amazon SES from the{' '}
            <code>mail.cromotrade.ca</code> domain. We honour bounce and complaint
            signals automatically and never re-send to addresses that have indicated
            they no longer wish to hear from us.
          </p>
        </Section>

        <Section title="5. How we share information">
          <p>
            We share personal information only with infrastructure providers acting on
            our behalf (Amazon Web Services for hosting, email, and storage), and only
            to the extent necessary to operate the service. We do not transfer your
            data to advertisers or data brokers.
          </p>
          <p>
            Your username, display name, avatar, public collection, and trade ratings
            are visible to other authenticated Cromo users by design — that is the
            point of a trading platform. You can switch your profile to private from{' '}
            <strong>Settings → Privacy</strong>.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            All traffic is served over TLS. Passwords are stored only as salted hashes
            (or delegated to Amazon Cognito, which we use for managed authentication).
            Access to production systems requires multi-factor authentication.
          </p>
        </Section>

        <Section title="7. Data retention">
          <p>
            We keep account and collection data for as long as your account is active.
            Operational logs are retained for up to 90 days. When you delete your
            account, your profile, collection, and message history are removed within
            30 days; trade records may be retained in anonymised form to preserve the
            integrity of other users&apos; ratings.
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            Depending on your jurisdiction, you may have the right to access, correct,
            delete, or export your personal information, and to withdraw consent for
            optional processing. Most of these actions are self-serve from{' '}
            <strong>Settings → Account</strong>. For anything else, email{' '}
            <a className="underline" href="mailto:privacy@cromotrade.ca">
              privacy@cromotrade.ca
            </a>{' '}
            and we will respond within 30 days.
          </p>
        </Section>

        <Section title="9. Children">
          <p>
            Cromo is not directed at children under 13 (or 16 in some jurisdictions),
            and we do not knowingly collect personal information from them. If you
            believe a child has created an account, contact us and we will delete it.
          </p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            We will update this page when our practices change. The &quot;last
            updated&quot; date above always reflects the current version. Material
            changes will also be announced in the in-app changelog.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about this policy can be sent to{' '}
            <a className="underline" href="mailto:privacy@cromotrade.ca">
              privacy@cromotrade.ca
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
