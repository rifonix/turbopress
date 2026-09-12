import Link from 'next/link';

export function Logo({
  className = '',
  variant = 'dark',
}: {
  className?: string;
  variant?: 'dark' | 'light';
}) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}
      aria-label="WP Instant homepage"
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          variant === 'light' ? 'bg-white text-[#f03e2f]' : 'bg-[#171717] text-white group-hover:bg-[#f03e2f]'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3.5 w-3.5">
          <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={variant === 'light' ? 'text-white' : 'text-[#171717]'}>
        WP&nbsp;Instant
      </span>
    </Link>
  );
}
