"use client";

import { FormEvent, useState } from "react";

import { ContactLinks } from "../components/ContactLinks";
import { FrogDecor } from "../components/FrogDecor";

const TESTFLIGHT_URL = "https://testflight.apple.com/join/c8UddR7K";
const LEAP_EMAIL = "taketheleap.app@gmail.com";
const CHALLENGE_TIME = "12:00PM ET";

export default function Home() {
  const [name, setName] = useState("");
  const [challenge, setChallenge] = useState("");

  function handleSuggestSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = challenge.trim();
    if (!trimmed) return;

    const from = name.trim();
    const bodyLines = [
      "Leap suggestion:",
      "",
      trimmed,
      "",
      from ? `From: ${from}` : "From: (anonymous)",
    ];

    const mailto = new URL(`mailto:${LEAP_EMAIL}`);
    mailto.searchParams.set("subject", "Leap suggestion");
    mailto.searchParams.set("body", bodyLines.join("\n"));
    window.location.href = mailto.toString();
  }

  return (
    <>
      <header className="top-bar">
        <div className="site-inner top-bar-inner">
          <a href="#top" className="brand-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brandmark.png"
              alt=""
              width={36}
              height={36}
              className="brandmark-sm"
            />
            <span className="wordmark">Leap</span>
          </a>
          <a
            href={TESTFLIGHT_URL}
            className="btn-primary top-cta"
            target="_blank"
            rel="noreferrer"
          >
            Join the beta
          </a>
        </div>
      </header>

      <main id="top">
        <section className="band hero-band" aria-labelledby="hero-heading">
          <div className="site-inner hero-layout">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brandmark.png"
              alt=""
              width={88}
              height={88}
              className="brandmark-hero"
            />

            <div className="hero-copy">
              <p className="eyebrow">A fun challenge, every single day.</p>
              <h1 id="hero-heading" className="headline-hero">
                Take the leap.
                <br />
                <span className="headline-accent">Together.</span>
              </h1>
              <p className="hero-lead">
                One challenge for everyone at {CHALLENGE_TIME}. Post your video, see who
                showed up, and join in with your community.
              </p>

              <div className="hero-highlights" aria-label="What you get each day">
                <div className="hero-highlight">
                  <span className="hero-highlight-tag">{CHALLENGE_TIME}</span>
                  <span className="hero-highlight-text">Same leap for everyone</span>
                </div>
                <div className="hero-highlight">
                  <span className="hero-highlight-tag">No edits</span>
                  <span className="hero-highlight-text">Post what you recorded</span>
                </div>
                <div className="hero-highlight">
                  <span className="hero-highlight-tag">Together</span>
                  <span className="hero-highlight-text">Show up with your community</span>
                </div>
              </div>

              <div className="hero-actions">
                <a
                  href={TESTFLIGHT_URL}
                  className="btn-primary"
                  target="_blank"
                  rel="noreferrer"
                >
                  Join the beta
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="band band-tint band-pad" aria-labelledby="problem-heading">
          <div className="site-inner">
            <div className="problem-intro">
              <p className="section-label">Why we built Leap</p>
              <div className="problem-vision">
                <h2 id="problem-heading" className="headline-md">
                  Social media promised connection but increasingly drives isolation.
                </h2>
                <p className="vision-lead">
                  The platforms designed to bring us together have made a generation more
                  anxious, more isolated, and less willing to participate.
                </p>
                <p className="vision-body">
                  Take your leap, show up with your community, and participate, not watch.
                </p>
              </div>
            </div>

            <div className="stat-row">
              <article className="stat-cell">
                <p className="stat-value">90%</p>
                <p className="stat-label">of people lurk on social media apps</p>
              </article>
              <article className="stat-cell">
                <p className="stat-value">80%</p>
                <p className="stat-label">
                  of Gen Z report feeling lonely over a 12-month period
                </p>
              </article>
              <article className="stat-cell">
                <p className="stat-value">84%</p>
                <p className="stat-label">
                  Adults hope for a fulfilling life where they share experiences with others
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="band band-pad" aria-labelledby="how-heading">
          <div className="site-inner">
            <div className="how-intro">
              <p className="section-label">How it works</p>
              <h2 id="how-heading" className="headline-md">
                Simple enough to do every day.
              </h2>
              <p className="body-text">
                Take the leap, then see who took it with you.
              </p>
            </div>

            <div className="feature-grid">
              <article className="feature-card">
                <p className="feature-index">01</p>
                <h3>A fun challenge every day</h3>
                <p>
                  A new challenge drops at {CHALLENGE_TIME}. Everyone gets the same one, so
                  you are in it together.
                </p>
              </article>
              <article className="feature-card">
                <p className="feature-index">02</p>
                <h3>No edits</h3>
                <p>
                  Record your video and post it as is. No filters, no cutting it together in
                  an editor.
                </p>
              </article>
              <article className="feature-card">
                <p className="feature-index">03</p>
                <h3>See who showed up</h3>
                <p>
                  A weekly board highlights people who took the leap, based on participation,
                  not follower counts.
                </p>
              </article>
              <article className="feature-card">
                <p className="feature-index">04</p>
                <h3>Focus on the group</h3>
                <p>
                  Follower counts stay hidden. Less comparison, more connection with the
                  people doing the challenge with you.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="band band-tint band-pad-sm">
          <div className="site-inner">
            <div className="cta-panel">
              <div className="cta-panel-copy">
                <h2 className="headline-md">Ready for today&apos;s leap?</h2>
                <p className="body-text">
                  Download the iOS beta and take the leap with the community.
                </p>
              </div>
              <a
                href={TESTFLIGHT_URL}
                className="btn-primary"
                target="_blank"
                rel="noreferrer"
              >
                Join the beta
              </a>
            </div>
          </div>
        </section>

        <section className="band band-pad" aria-labelledby="suggest-heading">
          <div className="site-inner suggest-block">
            <div className="suggest-header">
              <FrogDecor size={52} className="frog-suggest" />
              <p className="section-label">Suggest a leap</p>
              <h2 id="suggest-heading" className="headline-md mt-sm">
                What should tomorrow&apos;s leap be?
              </h2>
              <p className="body-text mt-sm">
                We read every idea. Good ones become a leap the whole community takes
                together.
              </p>
            </div>

            <div className="suggest-card">
              <form className="form-stack" onSubmit={handleSuggestSubmit} noValidate>
                <div>
                  <label className="field-label" htmlFor="suggest-name">
                    Name (optional)
                  </label>
                  <input
                    id="suggest-name"
                    className="field-input"
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="suggest-challenge">
                    Your leap idea
                  </label>
                  <textarea
                    id="suggest-challenge"
                    className="field-textarea"
                    name="challenge"
                    required
                    placeholder="e.g. Call someone you have not talked to in a year"
                    value={challenge}
                    onChange={(e) => setChallenge(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={!challenge.trim()}>
                    Submit idea
                  </button>
                </div>
              </form>
              <ContactLinks email={LEAP_EMAIL} />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-inner">
          <div className="footer-bar">
            <div className="footer-brand">
              <FrogDecor size={20} className="frog-footer" />
              <span>Leap</span>
            </div>
            <nav className="footer-nav" aria-label="Footer">
              <a href="https://taketheleap.app">taketheleap.app</a>
              <span className="footer-sep" aria-hidden>
                ·
              </span>
              <a href={TESTFLIGHT_URL} target="_blank" rel="noreferrer">
                Join the beta
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
