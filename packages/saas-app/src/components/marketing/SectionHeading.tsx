export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  as: Heading = 'h2',
  className = '',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} ${className}`}>
      {eyebrow && (
        <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#f03e2f]">
          {eyebrow}
        </p>
      )}
      <Heading className="text-balance text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
        {title}
      </Heading>
      {description && <p className="mt-4 text-pretty text-base leading-relaxed text-[#71717a]">{description}</p>}
    </div>
  );
}
