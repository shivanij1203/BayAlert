import { useEffect, useState } from "react";
import { motion } from "motion/react";

/**
 * Top navigation bar. Sticky, translucent, blurs the waves beneath.
 * Includes the BayAlert mark + wordmark, in-page nav links, and a live
 * pipeline status pill.
 */
export default function NavBar({ onJumpToDashboard, connected }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToId(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <motion.header
      className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      role="banner"
    >
      <a className="nav-brand" href="#top" aria-label="BayAlert home">
        <BayAlertMark />
        <span className="nav-wordmark">
          <span className="nav-word-bay">Bay</span>
          <span className="nav-word-alert">Alert</span>
        </span>
      </a>

      <nav className="nav-links" aria-label="Primary">
        <button type="button" className="nav-link" onClick={() => scrollToId("how-it-works")}>
          How it works
        </button>
        <button type="button" className="nav-link" onClick={() => scrollToId("why-it-matters")}>
          Why it matters
        </button>
        <button type="button" className="nav-link" onClick={onJumpToDashboard}>
          Live dashboard
        </button>
      </nav>

      <div className="nav-right">
        <span
          className={`nav-status ${connected ? "live" : "offline"}`}
          role="status"
          aria-live="polite"
        >
          <span className="nav-status-dot" aria-hidden="true" />
          {connected ? "Pipeline live" : "Pipeline offline"}
        </span>
        <a
          href="https://github.com/shivanij1203/BayAlert"
          target="_blank"
          rel="noreferrer"
          className="nav-github"
          aria-label="View BayAlert on GitHub"
        >
          <GitHubIcon />
        </a>
      </div>
    </motion.header>
  );
}

/**
 * BayAlert logo mark. Concentric pulse rings (sensor ping) wrapped around
 * a stylized water-drop wave — evokes "detect + propagate".
 */
function BayAlertMark() {
  return (
    <span className="nav-mark" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="bamark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="14" stroke="url(#bamark)" strokeWidth="1.2" opacity="0.35" />
        <circle cx="16" cy="16" r="10" stroke="url(#bamark)" strokeWidth="1.2" opacity="0.55" />
        <path
          d="M16 7 C 19.5 11, 22 14, 22 17.5 A 6 6 0 0 1 10 17.5 C 10 14, 12.5 11, 16 7 Z"
          fill="url(#bamark)"
        />
        <circle cx="16" cy="18" r="1.6" fill="#0a1628" />
      </svg>
    </span>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
