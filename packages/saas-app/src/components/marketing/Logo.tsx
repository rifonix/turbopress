import Image from 'next/image';
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
      <Image
        src="/wp-instant-logo.svg"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 rounded-[7px]"
        priority
      />
      <span className={variant === 'light' ? 'text-white' : 'text-[#171717]'}>
        WP&nbsp;Instant
      </span>
    </Link>
  );
}
