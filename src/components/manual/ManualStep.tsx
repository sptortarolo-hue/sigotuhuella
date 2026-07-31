import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

const stepColors = [
  { badge: 'bg-brand-primary', text: 'text-brand-primary' },
  { badge: 'bg-brand-secondary', text: 'text-brand-secondary' },
  { badge: 'bg-emerald-500', text: 'text-emerald-600' },
  { badge: 'bg-sky-500', text: 'text-sky-600' },
  { badge: 'bg-amber-500', text: 'text-amber-600' },
  { badge: 'bg-rose-500', text: 'text-rose-600' },
];

type ManualStepProps = {
  number: number;
  title: string;
  icon: LucideIcon;
  visual?: ReactNode;
  children: ReactNode;
};

export default function ManualStep({ number, title, icon: Icon, visual, children }: ManualStepProps) {
  const color = stepColors[(number - 1) % stepColors.length];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
      <div className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-accent shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 ${color.badge} text-white rounded-2xl flex items-center justify-center font-bold text-lg sm:text-xl shadow-lg shrink-0`}>
            {number}
          </div>
          <Icon className={`w-6 h-6 ${color.text} shrink-0`} />
          <h3 className="text-xl sm:text-2xl font-bold text-brand-primary">{title}</h3>
        </div>
        <div className="text-sm sm:text-base text-gray-600 leading-relaxed space-y-3">
          {children}
        </div>
      </div>
      {visual && (
        <div className="flex justify-center md:justify-end">{visual}</div>
      )}
    </div>
  );
}
