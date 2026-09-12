import type { LucideIcon } from 'lucide-react';

export function FeatureCard({
  index,
  icon: Icon,
  title,
  description,
}: {
  index: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#d4d4d8] hover:shadow-[0_18px_42px_rgba(23,23,23,0.08)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff1ef] text-[#f03e2f] transition-colors duration-300 group-hover:bg-[#f03e2f] group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="meta mt-5 text-[#dc2e20]">{index}</p>
      <h3 className="mt-2 text-base font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-[#71717a]">{description}</p>
    </article>
  );
}
