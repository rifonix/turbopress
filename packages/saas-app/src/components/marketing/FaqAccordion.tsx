'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

export function FaqAccordion({ items }: { items: { question: string; answer: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl divide-y divide-[#e4e4e7] overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white">
      {items.map((item, index) => {
        const expanded = open === index;
        return (
          <div key={item.question}>
            <h3>
              <button
                type="button"
                className="flex min-h-16 w-full items-center justify-between gap-6 px-6 py-5 text-left text-base font-semibold transition-colors hover:bg-[#fafafa]"
                aria-expanded={expanded}
                aria-controls={`faq-panel-${index}`}
                id={`faq-button-${index}`}
                onClick={() => setOpen(expanded ? null : index)}
              >
                <span>{item.question}</span>
                <Plus
                  className={`h-5 w-5 shrink-0 text-[#f03e2f] transition-transform duration-200 ${expanded ? 'rotate-45' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={`faq-panel-${index}`}
              role="region"
              aria-labelledby={`faq-button-${index}`}
              hidden={!expanded}
              className="px-6 pb-6"
            >
              <p className="max-w-3xl text-sm leading-relaxed text-[#52525b]">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
