import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type ManualSectionTitleProps = {
  id?: string;
  icon: LucideIcon;
  children: ReactNode;
};

export default function ManualSectionTitle({ id, icon: Icon, children }: ManualSectionTitleProps) {
  return (
    <div id={id} className="scroll-mt-20 flex items-center gap-3 mb-8 sm:mb-10">
      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary">{children}</h2>
    </div>
  );
}
