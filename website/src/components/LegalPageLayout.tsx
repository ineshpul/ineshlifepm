import Link from "next/link";

import { FrogDecor } from "./FrogDecor";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/leap-one-day-one-leap/id6764062329";

type LegalPageLayoutProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  return (
    <>
      <header className="top-bar">
        <div className="site-inner top-bar-inner">
          <Link href="/" className="brand-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brandmark.png"
              alt=""
              width={36}
              height={36}
              className="brandmark-sm"
            />
            <span className="wordmark">Leap</span>
          </Link>
          <Link href={APP_STORE_URL} className="btn-primary top-cta" target="_blank" rel="noreferrer">
            Take the Leap
          </Link>
        </div>
      </header>

      <main className="legal-page">
        <div className="site-inner legal-page-inner">
          <nav className="legal-back" aria-label="Breadcrumb">
            <Link href="/">← Home</Link>
          </nav>
          <h1 className="legal-title">{title}</h1>
          {children}
        </div>
      </main>

      <footer className="site-footer">
        <div className="site-inner">
          <div className="footer-bar">
            <div className="footer-brand">
              <FrogDecor size={20} className="frog-footer" />
              <span>Leap</span>
            </div>
            <nav className="footer-nav" aria-label="Footer">
              <Link href="/privacy">Privacy</Link>
              <span className="footer-sep" aria-hidden>
                ·
              </span>
              <Link href="/terms">Terms</Link>
              <span className="footer-sep" aria-hidden>
                ·
              </span>
              <Link href={APP_STORE_URL} target="_blank" rel="noreferrer">
                Take the Leap
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
