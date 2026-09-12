const STROKE = '#3f3f46';

const common = {
  fill: 'none',
  stroke: STROKE,
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Shield() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <ellipse cx="60" cy="60" rx="46" ry="46" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />
      <ellipse cx="60" cy="60" rx="46" ry="18" fill="none" stroke={STROKE} strokeWidth="1" opacity="0.7" transform="rotate(-24 60 60)" />
      <circle cx="106" cy="60" r="2" fill={STROKE} />
      <circle cx="14" cy="60" r="2" fill={STROKE} />
      <path d="M60 34l18 7v12c0 12-8 20-18 25-10-5-18-13-18-25V41l18-7z" {...common} />
      <path d="M53 56l5 5 9-11" {...common} />
    </svg>
  );
}

function Gauge() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <path d="M22 84a38 38 0 0 1 76 0" {...common} />
      {[22, 34, 60, 86, 98].map((x, i) => (
        <line key={i} x1={x} y1={i === 2 ? 40 : 46} x2={x} y2={52} {...common} opacity={i === 2 ? 1 : 0.6} />
      ))}
      <line x1="60" y1="84" x2="82" y2="58" {...common} />
      <circle cx="60" cy="84" r="3.5" fill={STROKE} />
      <path d="M96 30l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" {...common} />
    </svg>
  );
}

function Bolt() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <rect x="26" y="26" width="68" height="68" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" opacity="0.55" />
      <path d="M66 30L44 64h13l-5 26 24-36H63l3-24z" {...common} />
      <path d="M92 22l1.8 4.5 4.5 1.8-4.5 1.8-1.8 4.5-1.8-4.5-4.5-1.8 4.5-1.8z" {...common} />
    </svg>
  );
}

function Sliders() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <rect x="24" y="24" width="72" height="72" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" opacity="0.55" />
      <line x1="34" y1="48" x2="86" y2="48" {...common} opacity="0.6" />
      <circle cx="52" cy="48" r="6" {...common} fill="#f4f2ec" />
      <line x1="34" y1="66" x2="86" y2="66" {...common} opacity="0.6" />
      <circle cx="70" cy="66" r="6" {...common} fill="#f4f2ec" />
      <line x1="34" y1="84" x2="86" y2="84" {...common} opacity="0.6" />
      <circle cx="44" cy="84" r="6" {...common} fill="#f4f2ec" />
    </svg>
  );
}

function Server() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <ellipse cx="60" cy="60" rx="46" ry="46" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />
      <rect x="38" y="38" width="44" height="18" rx="3" {...common} />
      <rect x="38" y="62" width="44" height="18" rx="3" {...common} />
      <circle cx="46" cy="47" r="1.8" fill={STROKE} />
      <circle cx="46" cy="71" r="1.8" fill={STROKE} />
      <line x1="54" y1="47" x2="72" y2="47" {...common} opacity="0.6" />
      <line x1="54" y1="71" x2="72" y2="71" {...common} opacity="0.6" />
    </svg>
  );
}

function Document() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <ellipse cx="60" cy="60" rx="44" ry="44" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />
      <path d="M46 32h20l10 10v34H46z" {...common} />
      <path d="M66 32v10h10" {...common} />
      <line x1="52" y1="52" x2="70" y2="52" {...common} opacity="0.7" />
      <line x1="52" y1="59" x2="70" y2="59" {...common} opacity="0.7" />
      <line x1="52" y1="66" x2="64" y2="66" {...common} opacity="0.7" />
      <circle cx="88" cy="82" r="2" fill={STROKE} />
    </svg>
  );
}

function ImageArt() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <rect x="32" y="34" width="56" height="52" rx="4" {...common} />
      <circle cx="47" cy="49" r="4" {...common} />
      <path d="M34 78l14-14 10 9 12-12 16 17" {...common} />
      <path d="M92 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" {...common} />
    </svg>
  );
}

function Clock() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <rect x="26" y="26" width="68" height="68" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" opacity="0.55" />
      <circle cx="60" cy="60" r="22" {...common} />
      <line x1="60" y1="60" x2="60" y2="46" {...common} />
      <line x1="60" y1="60" x2="71" y2="66" {...common} />
      <circle cx="60" cy="60" r="2" fill={STROKE} />
    </svg>
  );
}

function Cart() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <ellipse cx="60" cy="60" rx="46" ry="46" fill="none" stroke={STROKE} strokeWidth="1" strokeDasharray="3 4" opacity="0.55" />
      <path d="M36 44h8l6 24h26l8-18H48" {...common} />
      <circle cx="58" cy="82" r="3" {...common} />
      <circle cx="76" cy="82" r="3" {...common} />
      <path d="M80 34l3 3 5-5" {...common} />
    </svg>
  );
}

function Pulse() {
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" aria-hidden="true">
      <circle cx="60" cy="60" r="30" {...common} />
      <ellipse cx="60" cy="60" rx="30" ry="11" {...common} opacity="0.7" />
      <line x1="60" y1="30" x2="60" y2="90" {...common} opacity="0.5" />
      <path d="M38 60h12l5-9 7 18 5-9h15" {...common} strokeWidth={2} />
    </svg>
  );
}

const art = {
  shield: Shield,
  gauge: Gauge,
  bolt: Bolt,
  sliders: Sliders,
  server: Server,
  document: Document,
  image: ImageArt,
  clock: Clock,
  cart: Cart,
  pulse: Pulse,
} as const;

export type LineArtKind = keyof typeof art;

export function LineArt({ kind }: { kind: LineArtKind }) {
  const Art = art[kind];
  return <Art />;
}
