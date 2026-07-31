import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type ManualSection = { id: string; label: string };

type ManualLayoutProps = {
  chapterTitle: string;
  chapterDescription: string;
  icon: LucideIcon;
  sections: ManualSection[];
  children: ReactNode;
};

export default function ManualLayout({ chapterTitle, chapterDescription, icon: Icon, sections, children }: ManualLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-bg to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <Link to="/manual" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-brand-primary font-bold transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Volver al manual
        </Link>

        <div className="text-center mb-8 sm:mb-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-3 sm:mb-4 leading-tight">
            {chapterTitle}
          </h1>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">{chapterDescription}</p>
        </div>

        {sections.length > 0 && (
          <nav className="flex gap-2 overflow-x-auto pb-2 mb-10 sm:mb-14 justify-start md:justify-center" aria-label="Índice del capítulo">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors',
                  'bg-white border-brand-accent text-brand-primary hover:border-brand-primary',
                )}
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}

        <div className="space-y-14 sm:space-y-20">{children}</div>
      </div>
    </div>
  );
}
