"use client";

import { useEffect, useRef, useState } from "react";

import type { MarketingPayload } from "../lib/marketingCore";
import { msUntilNextLeapDrop } from "../lib/nyChallengeWindow";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/leap-one-day-one-leap/id6764062329";
const CHALLENGE_TIME = "12:00PM ET";

type MarketingResponse = MarketingPayload & { error?: string };

type HeroLiveModuleProps = {
  initialMarketing: MarketingResponse | null;
  initialMarketingError: string | null;
};

export function HeroLiveModule({
  initialMarketing,
  initialMarketingError,
}: HeroLiveModuleProps) {
  const liveRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef<HTMLDivElement>(null);
  const [marketing, setMarketing] = useState<MarketingResponse | null>(
    initialMarketing,
  );
  const [marketingError, setMarketingError] = useState<string | null>(
    initialMarketingError,
  );

  async function refreshMarketing(signal?: AbortSignal) {
    try {
      const res = await fetch("/api/marketing", {
        signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json()) as MarketingResponse;
      if (!res.ok) {
        setMarketing((current) => {
          if (!(current?.isLive && current.leapTitle)) {
            setMarketingError(data.error ?? "Could not load today's leap.");
          }
          return current;
        });
        return;
      }
      setMarketingError(null);
      setMarketing(data);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setMarketing((current) => {
        if (!(current?.isLive && current.leapTitle)) {
          setMarketingError("Could not load today's leap.");
        }
        return current;
      });
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    let dropTimeoutId = 0;

    const scheduleDropRefresh = () => {
      window.clearTimeout(dropTimeoutId);
      dropTimeoutId = window.setTimeout(() => {
        void refreshMarketing(ctrl.signal);
        scheduleDropRefresh();
      }, msUntilNextLeapDrop(Date.now()) + 250);
    };

    void refreshMarketing(ctrl.signal);
    const pollId = window.setInterval(
      () => void refreshMarketing(ctrl.signal),
      30_000,
    );
    scheduleDropRefresh();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshMarketing(ctrl.signal);
      }
    };
    const onPageShow = () => {
      void refreshMarketing(ctrl.signal);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      ctrl.abort();
      window.clearInterval(pollId);
      window.clearTimeout(dropTimeoutId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    const live = liveRef.current;
    const highlights = highlightsRef.current;
    if (!live || !highlights) return;

    const mq = window.matchMedia("(max-width: 639px)");

    const syncHeight = () => {
      if (!mq.matches) {
        live.style.minHeight = "";
        return;
      }
      live.style.minHeight = `${highlights.offsetHeight}px`;
    };

    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(highlights);
    mq.addEventListener("change", syncHeight);
    window.addEventListener("orientationchange", syncHeight);

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", syncHeight);
      window.removeEventListener("orientationchange", syncHeight);
      live.style.minHeight = "";
    };
  }, []);

  const leapIsLive = Boolean(marketing?.isLive && marketing.leapTitle);
  const leapTitle = leapIsLive
    ? marketing!.leapTitle!
    : marketing?.isLive && !marketingError
      ? "Today\u2019s leap is loading\u2026"
      : null;
  const leapMeta = leapIsLive
    ? `${marketing!.postersCount.toLocaleString()} people posted today`
    : marketingError
      ? "Live leap is unavailable right now."
      : null;

  return (
    <div className="hero-module">
      <div className="hero-module-grid">
        <div className="hero-live" ref={liveRef}>
          <div className="hero-live-body">
            <p className="section-label">Leap of the Day</p>
            {leapTitle ? (
              <p className="market-title">{leapTitle}</p>
            ) : (
              <p className="market-title market-title-pending">
                Drops at {CHALLENGE_TIME}
              </p>
            )}
            {leapMeta ? <p className="market-meta">{leapMeta}</p> : null}
          </div>
          <div className="market-actions">
            <a
              href={APP_STORE_URL}
              className="btn-primary"
              target="_blank"
              rel="noreferrer"
            >
              Take the Leap
            </a>
            <a href="#suggest-heading" className="btn-primary btn-secondary">
              Suggest tomorrow&apos;s leap
            </a>
          </div>
        </div>

        <div
          className="hero-highlights"
          ref={highlightsRef}
          aria-label="What you get each day"
        >
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
            <span className="hero-highlight-text">
              Show up with your community
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
