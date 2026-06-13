Hello,

Thanks for the earlier review. Since then I've taken time to address every item that typically draws a yellow flag on a small-sender review, and I'd appreciate another look. The full picture is below.

A quick note on the domain. The live site is currently at https://dev.cromotrade.ca while I finalise launch. The apex, cromotrade.ca, is the production domain I'll cut over to once production access is approved — I'm holding it back so visitors don't land on a half-finished page in the meantime. Both subdomains live under the same Route 53 zone and SES identity, so the DKIM/SPF/DMARC/MAIL FROM setup below applies to everything sent.

1. Identity and domain authentication

- Verified SES identity: cromotrade.ca, in ca-central-1.
- DKIM: Easy DKIM is enabled; the three CNAMEs are published in Route 53 and verifying cleanly.
- SPF: cromotrade.ca TXT → v=spf1 include:amazonses.com include:spf.privateemail.com -all. (The privateemail.com include covers an inbound-mailbox provider used for support@/dmarc@; outbound application email still flows solely through SES.)
- Custom MAIL FROM: mail.cromotrade.ca, with the matching MX and SPF records. This aligns SPF with the visible From domain.
- DMARC: _dmarc.cromotrade.ca → v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@cromotrade.ca; ruf=mailto:dmarc@cromotrade.ca; fo=1. I'm starting at 10% quarantine to observe aggregate reports for a week before ramping to pct=100 and then p=reject.
- TLS: All sends go through a cromo-default SESv2 configuration set with TlsPolicy = REQUIRE.
- Discoverability: Privacy policy, terms of service, and a contact email are linked from the footer on every page:
  - https://dev.cromotrade.ca/privacy
  - https://dev.cromotrade.ca/terms
  - support@cromotrade.ca

2. The use case

Cromo is a small peer-to-peer trading app for collectors of the FIFA World Cup 2026 Panini sticker collection. The only emails it sends are transactional, and every one is triggered by the recipient's own action on their own account. There is no marketing list, no newsletter, and no campaigns. Expected steady-state volume is under 50 emails/day, with a launch peak around 150–200/day.

Every recipient provides their email address to Cromo themselves during signup; we never source addresses from third parties, mailing lists, or scraped sources. The verification email is the user's own confirmation that we have the correct address — the only way to be on our send list is to create an account and enter the email yourself.

3. The three email types

Below are the actual templates, exactly as they are sent today from the dev environment.

Email verification — sent once, on registration
From:    no-reply@cromotrade.ca
Subject: Verify your Cromo email address

Hi <username>,

Welcome to Cromo! Use the code below to verify your email address:

  849213

Enter it on the verification page. This code expires in 24 hours.
If you did not create an account, you can safely ignore this email.

Password reset — only on the user's explicit request
From:    no-reply@cromotrade.ca
Subject: Reset your Cromo password

Hi <username>,

We received a request to reset your Cromo password. Use the code below
to choose a new password:

  703184

Enter it on the password reset page. This code expires in 1 hour.
If you did not request a password reset, you can safely ignore this email.

Trade notification — the day after a trade completes, and only if the user has not opted out
From:    no-reply@cromotrade.ca
Subject: Rate your recent trade on Cromo
List-Unsubscribe: <https://dev.cromotrade.ca/settings?unsubscribe=email>,
                  <mailto:unsubscribe@dev.cromotrade.ca?subject=unsubscribe%20...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click

Hi <username>,

You completed a trade on Cromo yesterday. Leaving a quick thumbs up
or down helps other collectors trust their next swap.

  https://dev.cromotrade.ca/trade/<id>

You have up to 14 days from when the trade completed to leave a rating.

To stop receiving these reminders, visit
https://dev.cromotrade.ca/settings or reply to this email with "unsubscribe".

Once the apex cuts over, the same templates simply drop the dev. prefix — the From address and authentication setup do not change. There are no images, tracking pixels, or marketing content of any kind.

4. Bounce and complaint handling

Two layers of defence-in-depth. Since the previous reply I've moved the application layer from an HTTPS subscription to SQS — a more robust production pattern, and the one AWS itself recommends for SES bounce handling.

Account level. Account-level suppression is enabled for BOUNCE and COMPLAINT (aws_sesv2_account_suppression_attributes with suppressed_reasons = ["BOUNCE", "COMPLAINT"]). Even in the event of an application-side regression, SES itself would refuse to deliver a second message to a known-bad address.

Application level. SES is configured (via SESv2 configuration set event destinations) to publish every BOUNCE and COMPLAINT event to two SNS topics, cromo-ses-bounces and cromo-ses-complaints. SNS fans those out to a per-environment SQS queue (cromo-{env}-ses-events) with raw_message_delivery = true. The backend runs an in-process long-poller alongside its existing job worker; for each message it:
1. Parses the SES event payload.
2. Inserts every affected address into a Postgres email_suppressions table, along with the SES reason (bounce or complaint), bounce type/subtype and diagnostic code when applicable, and the full SES event payload for later inspection.
3. Deletes the message from the queue.

Every outgoing send checks that table first and is skipped if the recipient is on it.

Why SQS rather than an HTTPS subscription. Operationally it's strictly safer: bounce events queue for up to 14 days if the backend is rolling or temporarily down, instead of being dropped after SNS's HTTPS retry budget is exhausted. Authentication is enforced at the queue-policy layer — the queue policy only permits those two specific SES SNS topics to call sqs:SendMessage, so a forged or misrouted publish attempt cannot land. The backend's EC2 role has the standard consumer permissions (sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes, sqs:GetQueueUrl) scoped to that one queue ARN. Repeated processing failures are routed via a five-attempt redrive policy to a dead-letter queue, so fresh events are never blocked behind a stuck message.

Items that remain unchanged from the previous reply:
- Transient bounces are not suppressed — only permanent ones. Transients are left to SES's normal retry behaviour, since suppressing them would penalise legitimate recipients.
- Reputation metrics are enabled on the configuration set, and I monitor the SES reputation dashboard. Should any metric trend in the wrong direction, I'll respond the same day.

5. Unsubscribe and consent

- Verification and password-reset emails are required for account security, so they remain enabled while the account exists.
- The trade-rating reminder carries RFC 2369 List-Unsubscribe and RFC 8058 List-Unsubscribe-Post: List-Unsubscribe=One-Click headers, along with a plain-text unsubscribe pointer in the body. The reminder is sent during a 14-day window after a completed trade and stops as soon as the user submits a rating. Users who do not wish to receive these can delete their account, which removes them from all future sends.
- There is no path to receiving any email from us other than by creating an account yourself.

6. What I'm asking for

Modest limits, comfortably above my forecast:
- Daily quota: 50,000 emails/day
- Send rate: 14 messages/second
- Region: ca-central-1

If anything here would be easier to evaluate with screenshots, DNS dumps, the suppression table schema, or the poller source, I'd be glad to send them along.

Thank you again for taking another look — much appreciated.

Best regards,
Luisa Rojas
