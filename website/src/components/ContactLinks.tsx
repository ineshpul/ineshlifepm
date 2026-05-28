const ICON_SIZE = 18;

function MailIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.5 3c.6 2.4 2.4 4.2 4.8 4.8V12c-2.8 0-5.4-1-7.4-2.6v7.1a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v3.2a2.3 2.3 0 1 0 1.6 2.1V3h5.6z" />
    </svg>
  );
}

type Props = {
  email: string;
};

export function ContactLinks({ email }: Props) {
  return (
    <div className="suggest-card-footer">
      <p className="suggest-card-footer-label">Questions or feedback?</p>
      <div className="contact-row">
        <a className="contact-pill" href={`mailto:${email}`}>
          <span className="contact-pill-icon" aria-hidden>
            <MailIcon />
          </span>
          <span className="contact-pill-text">Email</span>
        </a>
        <a
          className="contact-pill"
          href="https://instagram.com/taketheleapapp"
          target="_blank"
          rel="noreferrer"
        >
          <span className="contact-pill-icon" aria-hidden>
            <InstagramIcon />
          </span>
          <span className="contact-pill-text">Instagram</span>
        </a>
        <a
          className="contact-pill"
          href="https://tiktok.com/@ineshleaps"
          target="_blank"
          rel="noreferrer"
        >
          <span className="contact-pill-icon" aria-hidden>
            <TikTokIcon />
          </span>
          <span className="contact-pill-text">TikTok</span>
        </a>
      </div>
    </div>
  );
}
