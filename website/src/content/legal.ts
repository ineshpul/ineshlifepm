/** Hosted legal copy — keep in sync with src/content/settingsLegal.ts in the mobile app. */

export type HostedLegalDocId = "terms" | "privacy" | "community";

export const HOSTED_LEGAL_DOCS: Record<
  HostedLegalDocId,
  { title: string; description: string; body: string }
> = {
  terms: {
    title: "Terms of use",
    description: "Terms of use for the Leap mobile app and related services.",
    body: `Last updated: June 18, 2026

These Terms of Use (“Terms”) are a binding agreement between you and Leap (“Leap,” “we,” “us,” or “our”) for your use of the Leap mobile app and related services (the “Service”).

Acceptance
By creating an account or using the Service, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the Service. You must be at least 13 years old (or the minimum age required in your region) to use Leap.

Your account
You are responsible for activity on your account and for keeping your sign-in credentials secure. Provide accurate information and notify us if your account is compromised.

Content you post
You retain ownership of content you submit. You grant Leap a worldwide, non-exclusive, royalty-free license to host, store, reproduce, adapt (e.g. for transcoding or thumbnails), display, and distribute your content solely to operate and improve the Service (for example, showing your video to people you allow to see it).

You represent that you have the rights needed to post your content and that it does not violate these Terms, our Community Guidelines, or applicable law.

Acceptable use
Do not harass others, post illegal or harmful content, impersonate others, spam, scrape the Service, reverse engineer it, or attempt to harm Leap or other users. We may remove content, restrict features, or suspend or terminate accounts that violate these rules.

Copyright and DMCA
If you believe content on Leap infringes your copyright, contact us at support@leap.app with: (1) your contact information, (2) identification of the work, (3) identification of the material and its location, (4) a statement of good-faith belief, and (5) a statement under penalty of perjury that your notice is accurate and you are authorized to act. We may remove reported content and terminate repeat infringers.

Automated moderation
Leap uses automated systems, including third-party AI tools, to help review uploaded videos for safety and policy compliance. Automated results may be incorrect; human review may occur. See our Privacy Policy for details.

Disclaimers
THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEAP DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE UNINTERRUPTED, ERROR-FREE, OR SECURE OPERATION.

Limitation of liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEAP AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF (A) USD $100 OR (B) THE AMOUNT YOU PAID LEAP IN THE 12 MONTHS BEFORE THE CLAIM (IF ANY).

Indemnification
You agree to defend, indemnify, and hold harmless Leap from claims, damages, losses, and expenses (including reasonable attorneys’ fees) arising from your content, your use of the Service, or your violation of these Terms or applicable law.

Termination
You may stop using Leap at any time and may delete your account in Settings. We may suspend or terminate your access if you violate these Terms or if we reasonably believe termination is necessary to protect the Service or others.

Dispute resolution; binding arbitration
PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.

Informal resolution first
Before filing a claim, you agree to contact us at support@leap.app and try in good faith to resolve the dispute informally for at least 30 days.

Agreement to arbitrate
Except for the exceptions below, any dispute, claim, or controversy arising out of or relating to these Terms or the Service will be resolved by binding individual arbitration, not in court, under the American Arbitration Association (“AAA”) Consumer Arbitration Rules. The Federal Arbitration Act governs this section. The arbitrator may award the same damages and relief a court could award on an individual basis.

Class action waiver
YOU AND LEAP AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, REPRESENTATIVE, OR PRIVATE ATTORNEY GENERAL PROCEEDING. The arbitrator may not consolidate claims or preside over any form of representative proceeding.

Exceptions
Either party may (1) bring an individual claim in small claims court if it qualifies, or (2) seek injunctive or equitable relief in court to prevent misuse of intellectual property or unauthorized access to the Service.

Opt-out
You may opt out of arbitration within 30 days of first accepting these Terms by emailing support@leap.app with subject line “Arbitration Opt-Out,” your name, and the email associated with your account. Opting out does not affect other parts of these Terms.

Governing law
These Terms are governed by the laws of the State of Delaware, excluding conflict-of-law rules, except that the Federal Arbitration Act applies to the arbitration section.

Changes
We may update these Terms. If we make material changes, we will provide notice in the app or by other reasonable means. Continued use after the effective date means you accept the updated Terms. If you do not agree, stop using the Service.

Contact
Questions? Email support@leap.app.`,
  },
  privacy: {
    title: "Privacy policy",
    description: "How Leap collects, uses, and shares information.",
    body: `Last updated: June 18, 2026

This Privacy Policy describes how Leap (“Leap,” “we,” “us,” or “our”) collects, uses, and shares information when you use the Leap mobile app and related services (the “Service”).

What we collect
• Account details you provide (e.g. email, display name, username).
• Content you create (e.g. challenge videos, comments, messages).
• Technical data needed to run the app (e.g. device type, app version, push notification tokens if you enable notifications).
• Usage and safety data (e.g. reports, blocks, moderation outcomes, and logs needed to secure the Service).

How we use information
We use information to provide and operate the Service, personalize your experience, deliver notifications you opt into, keep the community safe, enforce our policies, comply with law, and improve Leap.

Automated processing and AI (FTC disclosure)
Leap uses automated systems, including artificial intelligence and machine-learning tools, in limited ways:

• Content safety review: When you upload a video, we may send it (or derived frames) to automated moderation services, including Amazon Web Services Rekognition, to detect content that may violate our Community Guidelines or Terms (for example, nudity, violence, or other prohibited material). This processing helps us review uploads before or while they are shown on the Service.

• How decisions are made: Automated tools produce signals or scores; Leap (and, when needed, human reviewers) uses those results to approve, reject, or restrict content. Automated review may be inaccurate. If your content is affected, you may contact support@leap.app.

• What we do not do: We do not use AI to make employment, credit, housing, or similar high-risk decisions about you. We do not sell your personal information to third parties for their own marketing. We do not use your videos to train public-facing generative AI models.

• Third-party AI processors: Our AI moderation providers process content on our behalf under contractual confidentiality and security obligations. Their use of data is limited to providing services to Leap.

Sharing
We do not sell your personal information. We may share data with service providers who help us host, operate, secure, and moderate the app (including cloud hosting, analytics, and content-moderation vendors), under contractual protections. We may also disclose information if required by law or to protect rights, safety, and security.

Your choices
You can adjust notifications in Settings, block or mute users, and delete your account from Settings → Account. If you do not want your videos processed for automated moderation, do not upload videos to the Service.

Data retention
We retain information while your account is active and as needed to operate the Service, comply with law, resolve disputes, and enforce our agreements. When you delete your account, we delete or de-identify personal information within a reasonable period, except where retention is required by law or legitimate business needs (e.g. safety records).

Children
Leap is not intended for children under 13 (or the minimum age required in your region). We do not knowingly collect personal information from children below that age.

U.S. state privacy rights
Depending on where you live, you may have rights to access, delete, or correct personal information, or to opt out of certain processing. Contact support@leap.app to submit a request. We will not discriminate against you for exercising applicable privacy rights.

International users
If you use Leap from outside the United States, your information may be processed in the United States or other countries where we or our service providers operate.

Changes
We may update this Privacy Policy. Material changes will be communicated in the app or by other reasonable means. Continued use after the effective date means you accept the updated policy.

Contact
Privacy questions? Email support@leap.app.`,
  },
  community: {
    title: "Community guidelines",
    description: "Rules for keeping the Leap community welcome and safe.",
    body: `Leap works best when everyone feels welcome and safe.

Be respectful
Treat others how you want to be treated. Disagree without harassment.

No harmful content
Do not post violence, hate, sexual content involving minors, or illegal activity.

Authenticity
Don’t impersonate others or spam the community.

Reporting
Use Report a problem or Contact support if you see something that breaks these guidelines.

Enforcement
We may warn, remove content, or ban accounts that violate these guidelines or the Terms of use.`,
  },
};
