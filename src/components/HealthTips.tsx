import { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { Loader2, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';

export default function HealthTips({ petId }: { petId: string }) {
  const [tips, setTips] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && tips.length === 0) {
      setLoading(true);
      api.get(`/my-pets/${petId}/health-tips`)
        .then(setTips)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, petId, tips.length]);

  return (
    <div className="mt-6 pt-4 border-t border-brand-accent">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" /> Tips de Salud
        </h4>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>
          ) : (
            tips.map((tip, i) => (
              <div key={i} className="p-3 bg-brand-bg rounded-xl text-sm text-gray-700 leading-relaxed">
                <strong className="text-brand-primary">{tip.title}</strong>
                <p className="mt-0.5">{tip.tip}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
