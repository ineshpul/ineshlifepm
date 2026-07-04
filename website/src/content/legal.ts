/** Hosted legal copy — keep in sync with src/content/settingsLegal.ts in the mobile app. */

export type HostedLegalDocId = "terms" | "privacy" | "community";

export const HOSTED_LEGAL_DOCS: Record<
  HostedLegalDocId,
  { title: string; description: string; body: string }
> = {
  terms: {
    title: "Terms of use",
    description: "Terms of use for the Leap mobile app and related services.",
    body: `Last updated: June 30, 2026

These Terms of Use (“Terms”) form a binding agreement between you and Leap (“Leap,” “we,” “us,” or “our”) governing your use of the Leap mobile app and related services (the “Service”).

1. Acceptance
By creating an account or using the Service, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the Service. You must be at least 13 years old (or the minimum age required in your region) to use Leap. If you are under 18, you represent that a parent or legal guardian has reviewed and agreed to these Terms on your behalf where required by applicable law.

2. Your Account
You are responsible for all activity on your account and for keeping your sign-in credentials secure. Provide accurate information when creating your account and keep it up to date. Notify us immediately at support@leap.app if you believe your account has been compromised. We are not liable for losses caused by unauthorized use of your account if that use occurred because you failed to safeguard your credentials.

3. Content You Post
You retain ownership of the content you submit. By posting content, you grant Leap a worldwide, non-exclusive, royalty-free, sublicensable (to our service providers, solely to operate the Service) license to host, store, reproduce, adapt (e.g., for transcoding, thumbnails, or moderation review), display, and distribute your content for the purpose of operating, providing, promoting, and improving the Service. This license continues for content that has already been shared with other users at the time you delete your account or that content, to the extent technically necessary, but we will disassociate it from your identity where feasible.

You represent and warrant that:
• You own or have the necessary rights to post your content.
• Your content does not infringe any third party’s intellectual property, privacy, or publicity rights.
• Your content does not violate these Terms, our Community Guidelines, or applicable law.
• If your content depicts another identifiable person, you have their permission to post it.

4. Acceptable Use
You agree not to:
• Harass, threaten, bully, or abuse other users.
• Post content that is illegal, defamatory, obscene, or that promotes violence, self-harm, or hatred against a protected group.
• Impersonate any person or entity, or misrepresent your affiliation with one.
• Post spam or unauthorized advertising.
• Scrape, crawl, or use automated means to access the Service without our prior written consent.
• Reverse engineer, decompile, or attempt to extract the source code of the Service, except where applicable law prohibits this restriction.
• Attempt to gain unauthorized access to the Service, other accounts, or our systems.
• Upload content depicting a minor in a manner that violates law or our Community Guidelines, or that endangers child safety.

We may remove content, restrict features, suspend, or terminate accounts that violate these rules, with or without prior notice, at our reasonable discretion.

5. Reporting Child Safety Concerns
If you become aware of content on Leap that endangers a minor, report it immediately through the in-app reporting tool or email support@leap.app. We comply with applicable mandatory reporting laws and will report apparent child exploitation material to the National Center for Missing & Exploited Children (NCMEC) or equivalent authority as required by law.

6. Copyright and DMCA
If you believe content on Leap infringes your copyright, send a notice to our designated agent that includes:
• Your contact information.
• Identification of the copyrighted work claimed to be infringed.
• Identification of the material you claim is infringing and its location on the Service.
• A statement that you have a good-faith belief that the use is not authorized.
• A statement, under penalty of perjury, that the information is accurate and that you are authorized to act on behalf of the copyright owner.
• Your physical or electronic signature.

DMCA Agent: [Name], [Address], support@leap.app. [Note: register this agent with the U.S. Copyright Office at dmca.copyright.gov to preserve safe-harbor protection under 17 U.S.C. § 512.]

We will remove or disable access to reported content, notify the posting user, and terminate the accounts of repeat infringers in appropriate circumstances. Users who believe their content was removed in error may submit a counter-notice consistent with the DMCA.

7. Automated Moderation
Leap uses automated systems, including third-party AI tools, to help review uploaded videos for safety and policy compliance. Automated results may be inaccurate; we may also use human review. See our Privacy Policy for details on what data is processed and how.

8. Intellectual Property
The Service, including its design, logos, trademarks, and underlying software (excluding user content), is owned by Leap or our licensors and protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable, revocable license to use the Service for its intended personal, non-commercial purpose. All rights not expressly granted are reserved.

9. Third-Party Services
The Service may link to or integrate with third-party services (e.g., the Apple App Store). We are not responsible for the content, policies, or practices of third-party services, and your use of them is governed by their own terms.

10. Disclaimers
THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEAP DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT CONTENT MODERATION WILL CATCH ALL VIOLATIONS.

11. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEAP AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM YOUR USE OF (OR INABILITY TO USE) THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF (A) USD $100 OR (B) THE AMOUNT YOU PAID LEAP IN THE 12 MONTHS BEFORE THE CLAIM AROSE.

SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES, SO SOME OF THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU.

12. Indemnification
You agree to defend, indemnify, and hold harmless Leap and its officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, and expenses (including reasonable attorneys’ fees) arising from: (a) your content; (b) your use of the Service; (c) your violation of these Terms or applicable law; or (d) your violation of any third party’s rights.

13. Termination
You may stop using Leap at any time and may delete your account in Settings. We may suspend or terminate your access, with or without notice, if you violate these Terms, if required by law, or if we reasonably believe termination is necessary to protect the Service, our users, or third parties. Sections of these Terms that by their nature should survive termination (including Sections 3, 10–12, and 14) will survive.

14. Dispute Resolution; Binding Arbitration
PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.

Informal resolution first
Before filing a claim, you agree to contact us at support@leap.app and attempt in good faith to resolve the dispute informally for at least 30 days.

Agreement to arbitrate
Except as set out in “Exceptions” below, any dispute, claim, or controversy arising out of or relating to these Terms or the Service will be resolved by binding individual arbitration, not in court, administered under the American Arbitration Association’s Consumer Arbitration Rules. The Federal Arbitration Act governs this section. The arbitrator may award the same damages and relief a court could award on an individual basis, and must follow these Terms as a court would.

Class action waiver
YOU AND LEAP AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, REPRESENTATIVE, OR PRIVATE ATTORNEY GENERAL PROCEEDING. The arbitrator may not consolidate claims or preside over any form of representative or class proceeding. If this class action waiver is found unenforceable as to a particular claim or request for relief, that claim or request must be brought in court, and all other claims remain subject to arbitration.

Exceptions
Either party may: (1) bring an individual claim in small claims court if it qualifies; or (2) seek injunctive or other equitable relief in court to prevent misuse of intellectual property or unauthorized access to the Service.

Opt-out
You may opt out of this arbitration agreement within 30 days of first accepting these Terms by emailing support@leap.app with the subject line “Arbitration Opt-Out,” your name, and the email associated with your account. Opting out does not affect any other part of these Terms.

15. Governing Law
These Terms are governed by the laws of the State of Delaware, without regard to its conflict-of-law principles, except that the Federal Arbitration Act governs Section 14.

16. General Provisions
Severability: if any provision of these Terms is found unenforceable, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force.

No waiver: our failure to enforce any right or provision is not a waiver of that right or provision.

Assignment: you may not assign these Terms without our written consent; we may assign these Terms in connection with a merger, acquisition, or sale of assets.

Force majeure: we are not liable for delays or failures caused by events beyond our reasonable control.

Entire agreement: these Terms, together with our Privacy Policy and any Community Guidelines, constitute the entire agreement between you and Leap regarding the Service.

17. Changes to These Terms
We may update these Terms from time to time. If we make material changes, we will provide notice in the app, by email, or by other reasonable means, and will update the “Last updated” date above. Continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Service.

18. Contact
Questions about these Terms? Email support@leap.app.

[Company legal name and mailing address — required in most jurisdictions]`,
  },
  privacy: {
    title: "Privacy policy",
    description: "How Leap collects, uses, and shares information.",
    body: `Last updated: June 30, 2026

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
