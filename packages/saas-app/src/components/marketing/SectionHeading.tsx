import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  as: Heading = 'h2',
  tone = 'dark',
  id,
  className = '',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: 'left' | 'center';
  as?: 'h1' | 'h2' | 'h3';
  tone?: 'dark' | 'light';
  id?: string;
  className?: string;
}) {
  const light = tone === 'light';
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} ${className}`}>
      {eyebrow && (
        <p className={`mb-4 font-mono text-xs font-semibold uppercase tracking-[0.16em] ${light ? 'text-[#fca5a5]' : 'text-[#f03e2f]'}`}>
          {eyebrow}
        </p>
      )}
      <Heading
        {...(id ? { id } : {})}
        className={`text-balance text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em] ${light ? 'text-white' : ''}`}
      >
        {title}
      </Heading>
      {description && (
        <p className={`mt-4 text-pretty text-base leading-relaxed ${light ? 'text-white/65' : 'text-[#71717a]'}`}>
          {description}
        </p>
      )}
    </div>
  );
}

/** Accent phrase for two-tone section titles. */
export function TitleAccent({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={light ? 'text-[#fca5a5]' : 'text-[#f03e2f]'}>{children}</span>;
}
