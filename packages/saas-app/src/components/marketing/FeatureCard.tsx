import { LineArt, type LineArtKind } from './LineArt';

export function FeatureCard({
  index,
  art,
  title,
  description,
}: {
  index: string;
  art: LineArtKind;
  title: string;
  description: string;
}) {
  return (
    <article className="group flex flex-col rounded-[20px] bg-[#f1efe9] p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(23,23,23,0.10)]">
      <div className="grid place-items-center py-4 text-[#3f3f46] transition-transform duration-500 group-hover:scale-[1.04]">
        <LineArt kind={art} />
      </div>
      <p className="meta mt-6 text-[#dc2e20]">{index}</p>
      <h3 className="mt-2 text-lg font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[#71717a]">{description}</p>
    </article>
  );
}
