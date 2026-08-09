import { useState, useEffect } from 'react';
import { checkArgPhone, toE164 } from '@/src/lib/phone';
import { cn } from '@/src/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string, e164?: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
}

export function PhoneInput({ value, onChange, placeholder, className, disabled, autoComplete }: PhoneInputProps) {
  const [msg, setMsg] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'pending' | 'error'>('idle');
  const [pretty, setPretty] = useState('');

  useEffect(() => {
    if (!value) { setState('idle'); setMsg(''); setPretty(''); return; }
    const res = checkArgPhone(value);
    if (res.ok) { setState('ok'); setMsg(''); setPretty(res.formatted || ''); }
    else if (res.partial) { setState('pending'); setMsg(''); setPretty(''); }
    else { setState('error'); setMsg(res.message); setPretty(''); }
  }, [value]);

  return (
    <div>
      <input
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete || 'tel'}
        value={value}
        disabled={disabled}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw, raw ? toE164(raw) || undefined : undefined);
        }}
        placeholder={placeholder || '11-1234-5678'}
        className={cn(
          'w-full px-4 py-3 bg-white rounded-xl border outline-none transition-all',
          state === 'ok' && 'border-green-400 focus:border-green-500 focus:ring-2 focus:ring-green-100',
          state === 'error' && 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100',
          state !== 'ok' && state !== 'error' && 'border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100',
          disabled && 'opacity-60',
          className,
        )}
      />
      {state === 'error' && (
        <p className="text-xs text-red-500 mt-1">{msg}</p>
      )}
      {state === 'ok' && pretty && (
        <p className="text-xs text-green-600 mt-1">Se guardará como {pretty}</p>
      )}
    </div>
  );
}