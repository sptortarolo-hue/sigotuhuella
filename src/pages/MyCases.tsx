import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { Loader2, PawPrint, ChevronRight, HandHeart } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  active: 'En búsqueda',
  closed: 'Cerrado',
  pause: 'Pausado',
};

const TYPE_LABELS: Record<string, string> = {
  lost: 'Perdida',
  found: 'Encontrada',
};

export default function MyCases() {
  const { user } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.cases.mine();
        setCases(res.cases || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
      <header className="mb-8 text-center">
        <div className="inline-flex p-3 bg-brand-primary/10 text-brand-primary rounded-2xl mb-4"><PawPrint className="w-8 h-8" /></div>
        <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2">Mis Casos</h1>
        <p className="text-gray-500">Seguimiento de tus reportes de mascotas perdidas y encontradas</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-primary" /></div>
      ) : cases.length === 0 ? (
        <div className="text-center py-20 bg-brand-accent/30 rounded-3xl border-2 border-dashed border-brand-accent">
          <HandHeart className="w-12 h-12 mx-auto text-brand-primary/40 mb-4" />
          <p className="text-gray-500 font-medium">Todavía no tenés casos en seguimiento.</p>
          <p className="text-gray-400 text-sm mt-1">Cuando reportes una mascota perdida o encontrada, su caso aparecerá acá.</p>
          <Link to="/reportar" className="inline-block mt-6 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:bg-brand-primary/90 transition-colors">
            Reportar una mascota
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {cases.map((c) => {
            const img = c.image_data ? `data:${c.image_mime || 'image/jpeg'};base64,${c.image_data}` : null;
            return (
              <Link
                key={c.id}
                to={`/caso/${c.id}`}
                className="flex items-center gap-4 bg-white rounded-2xl border border-brand-accent p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-brand-bg shrink-0">
                  {img ? <img src={img} alt={c.pet_name || 'Mascota'} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><PawPrint className="w-6 h-6 text-brand-primary/40" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-gray-800 truncate">{c.pet_name || 'Mascota sin identificar'}</p>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", c.status === 'active' ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-gray-500")}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{TYPE_LABELS[c.type] || c.type} · {c.event_count} evento{c.event_count === 1 ? '' : 's'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}