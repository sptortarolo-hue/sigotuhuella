import { ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

type UiFrameProps = {
  children: ReactNode;
  variant?: 'phone' | 'desktop';
  label?: string;
  className?: string;
};

export default function UiFrame({ children, variant = 'phone', label, className }: UiFrameProps) {
  return (
    <figure className={cn('flex flex-col items-center', className)}>
      {variant === 'desktop' ? (
        <div className="w-full max-w-xl rounded-2xl border border-brand-accent bg-white shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-3 bg-brand-bg border-b border-brand-accent">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <div className="flex-1 ml-2 h-6 rounded-lg bg-white border border-brand-accent flex items-center px-3">
              <span className="text-[10px] text-gray-400">sigotuhuella.com.ar</span>
            </div>
          </div>
          <div className="bg-white">{children}</div>
        </div>
      ) : (
        <div className="w-[270px] sm:w-[290px] rounded-[2.75rem] bg-gray-900 p-2 shadow-2xl">
          <div className="rounded-[2.25rem] bg-white overflow-hidden">
            <div className="px-5 pt-3 flex items-center justify-between text-[9px] font-semibold text-gray-800">
              <span>9:41</span>
              <span className="tracking-tight">●●● 5G</span>
            </div>
            <div className="mx-auto mb-2 w-28 h-5 rounded-b-xl bg-gray-900" />
            {children}
            <div className="h-4" />
          </div>
        </div>
      )}
      {label && (
        <figcaption className="mt-3 text-xs text-gray-500 max-w-[290px] text-center">{label}</figcaption>
      )}
    </figure>
  );
}
