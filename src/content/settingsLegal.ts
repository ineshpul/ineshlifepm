/** In-app copy for Settings → Help / Legal & Safety. Replace with hosted pages later if needed. */

export type LegalDocId = 'faq' | 'terms' | 'privacy' | 'community';

export const LEGAL_DOCS: Record<
  LegalDocId,
  { title: string; body: string }
> = {
  faq: {
    title: 'FAQ',
    body: `What is Leap?
Leap is a daily challenge app: one prompt, one short video, shared with friends.

How do streaks work?
Post before the day’s deadline to keep your streak. Turn streak reminders on in Settings → Notifications if you want a nudge.

Who sees my posts?
Your feed and privacy choices (e.g. friends-only feed, private account) control visibility. You can block or mute people in Settings.

How do I report a problem?
Use Safety → Report a problem or Help / Legal → Contact support. We read every message.

Why don’t some links open in my browser?
Leap shows help and legal text inside the app so it always works. You’re not being sent to unrelated sites.`,
  },
  terms: {
    title: 'Terms of use',
    body: `These Terms of Use (“Terms”) apply to your use of Leap.

Acceptance
By using Leap, you agree to these Terms. If you disagree, do not use the app.

Your account
You are responsible for activity on your account. Keep your sign-in secure.

Content you post
You retain rights to your content. You grant Leap a license to host, display, and distribute your content as needed to run the service (e.g. show your video to people you allow to see it).

Acceptable use
No harassment, illegal content, or attempts to harm the service or other users. We may remove content or suspend accounts that violate these rules.

Disclaimers
The app is provided “as is.” We strive for reliability but do not guarantee uninterrupted service.

Changes
We may update these Terms. Continued use after changes means you accept the updated Terms.

Contact
Questions? Use Help / Legal → Contact support in Settings.`,
  },
  privacy: {
    title: 'Privacy policy',
    body: `This Privacy Policy describes how Leap handles information when you use the app.

What we collect
• Account details you provide (e.g. email, display name).
• Content you create (e.g. challenge videos, comments).
• Technical data needed to run the app (e.g. device type, push notification tokens if you enable notifications).

How we use information
To provide the service, personalize your experience, send notifications you opt into, keep the community safe, and improve Leap.

Sharing
We do not sell your personal information. We may share data with service providers who help us host and operate the app, under strict confidentiality.

Your choices
You can adjust notifications in Settings, block or mute users, and delete your account from Settings → Account.

Children
Leap is not intended for children under 13 (or the minimum age required in your region).

Contact
Privacy questions? Use Help / Legal → Contact support in Settings.`,
  },
  community: {
    title: 'Community guidelines',
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
