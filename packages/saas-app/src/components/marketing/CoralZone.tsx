'use client';

import { useState } from 'react';
import { Bell, Check, Flame, Zap } from 'lucide-react';

const minis = [
  {
    icon: Flame,
    iconClass: 'cm-flame',
    title: 'Cache warmup',
    body: 'Homepage and key templates prebuilt after every purge — visitors never wait on cold PHP.',
  },
  {
    icon: Bell,
    iconClass: 'cm-bell',
    title: 'Regression alerts',
    body: 'Real-user vitals per template flag slowdowns from content, plugin, or release changes.',
  },
  {
    icon: Zap,
    iconClass: 'cm-bolt',
    title: 'One-click pairing',
    body: 'Signed handshake, no DNS migration. Connected and optimizing in minutes, not sprints.',
  },
];

function AggressionSlider() {
  const [level, setLevel] = useState(72);
  const deferred = Math.round((level / 100) * 47);
  return (
    <div className="slider-mock">
      <div className="row">
        <span>blocking scripts deferred</span>
        <b>{deferred} / 47</b>
      </div>
      <div className="relative mt-3 mb-1 h-1.5 rounded-full bg-[#f1f1f2]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#f03e2f] to-[#16a34a] transition-[width] duration-150"
          style={{ width: `${level}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={level}
        onChange={(event) => setLevel(Number(event.target.value))}
        aria-label="Script deferral aggressiveness"
        className="mt-2 w-full accent-[#f03e2f]"
      />
      <div className="row mt-1">
        <span>safe</span>
        <span>ludicrous</span>
      </div>
    </div>
  );
}

function EngineChat() {
  const [applied, setApplied] = useState(false);
  return (
    <div className="chat-mock">
      <p className="q">why is mobile slow after my theme update?</p>
      <p className="a">
        <b>31 render-blocking scripts</b> reappeared with the update. Defer them and inline fresh critical CSS —
        LCP 4.1s → 1.8s.
      </p>
      <button
        type="button"
        className="apply"
        onClick={() => setApplied((value) => !value)}
        aria-pressed={applied}
      >
        {applied ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3 w-3" aria-hidden="true" /> Applied to staging
          </span>
        ) : (
          'Apply fix'
        )}
      </button>
    </div>
  );
}

export function CoralZone() {
  return (
    <div className="coral-zone">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
        More reasons teams choose WP Instant
      </p>
      <h2 className="mt-4 max-w-xl text-balance text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
        Built for stores, <span className="text-white/70">publishers, and site fleets</span>
      </h2>
      <div className="coral-cards">
        <article className="coral-card">
          <h3>Ask the engine</h3>
          <p>Describe the slowdown in plain words. Get the exact fix — reviewable before anything touches production.</p>
          <div className="mini-ui">
            <EngineChat />
          </div>
        </article>
        <article className="coral-card">
          <h3>Dial the aggressiveness</h3>
          <p>Drag the slider. Safe keeps everything render-blocking-free; ludicrous delays scripts until interaction.</p>
          <div className="mini-ui">
            <AggressionSlider />
          </div>
        </article>
      </div>
      <div className="coral-list">
        {minis.map((mini) => (
          <article key={mini.title} className="coral-mini">
            <div className={`cm-ic ${mini.iconClass}`}>
              <mini.icon className="h-[26px] w-[26px]" aria-hidden="true" />
            </div>
            <h3>{mini.title}</h3>
            <p>{mini.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
