import { useState, useEffect, useMemo } from 'react';
import { Check, ExternalLink, Loader2, SkipForward } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import {
  getPetCoverage,
  logShareConfirmation,
  type PetGroupCoverageEntry,
  type FbSearchGroup,
} from '@/src/lib/volunteerService';

const normGroupName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

interface ShareGroupsPickerProps {
  petId: string;
  groups: FbSearchGroup[];
  pageUrl?: string;
  onComplete: () => void;
}

export default function ShareGroupsPicker({ petId, groups, pageUrl, onComplete }: ShareGroupsPickerProps) {
  const [coverage, setCoverage] = useState<PetGroupCoverageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<{ name: string; url?: string; post_url?: string }[]>([]);
  const [currentPostUrl, setCurrentPostUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getPetCoverage(petId).catch(() => []),
    ]).then(([cov]) => {
      if (alive) {
        setCoverage(cov || []);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [petId]);

  const coverageMap = useMemo(() => {
    const m = new Map<string, PetGroupCoverageEntry>();
    coverage.forEach(c => m.set(normGroupName(c.group_name), c));
    return m;
  }, [coverage]);

  // Filtrar: solo grupos donde el voluntario NO está cubierto
  const remainingGroups = useMemo(
    () => groups.filter(g => !coverageMap.has(normGroupName(g.group_name))),
    [groups, coverageMap]
  );

  const totalOriginal = groups.length;
  const totalRemaining = remainingGroups.length;
  const currentGroup = remainingGroups[currentIndex];
  const isLast = currentIndex >= totalRemaining - 1;

  const handleConfirm = async () => {
    if (!currentGroup || saving) return;
    setSaving(true);
    const entry = {
      name: currentGroup.group_name,
      url: currentGroup.group_url || undefined,
      post_url: currentPostUrl.trim() || undefined,
    };
    try {
      await logShareConfirmation(petId, 'facebook', [entry]);
    } catch { }
    const newCompleted = [...completed, entry];
    setCompleted(newCompleted);
    setCurrentPostUrl('');

    if (isLast) {
      setDone(true);
      onComplete();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
    setSaving(false);
  };

  const handleSkip = () => {
    if (isLast) {
      setDone(true);
      onComplete();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (totalRemaining === 0 || done) {
    return (
      <div className="bg-green-50 rounded-2xl p-4 border border-green-200 text-center">
        <p className="text-sm font-bold text-green-700">
          {completed.length > 0
            ? `Compartiste en ${completed.length} grupo${completed.length === 1 ? '' : 's'}. ¡Gracias!`
            : 'No hay grupos pendientes para esta mascota.'}
        </p>
        {completed.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
            {completed.map((g, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                <Check className="w-2.5 h-2.5" /> {g.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-brand-bg rounded-2xl p-4 border border-brand-accent">
      {/* Progreso */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Compartir en grupos
        </p>
        <span className="text-[10px] font-bold text-gray-400 bg-white px-2 py-0.5 rounded-full">
          Quedan {totalRemaining - currentIndex} de {totalOriginal}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
        <div
          className="bg-brand-primary h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${((completed.length) / totalOriginal) * 100}%` }}
        />
      </div>

      {/* Grupo actual */}
      <div className="bg-white rounded-xl p-4 border border-brand-accent">
        <p className="text-sm font-bold text-gray-800 mb-1">{currentGroup.group_name}</p>

        {coverageMap.has(normGroupName(currentGroup.group_name)) && (
          <p className="text-[10px] text-amber-600 mb-2">
            Ya compartido por otro voluntario recientemente
          </p>
        )}

        {/* Instrucciones */}
        <ol className="text-[11px] text-gray-500 mb-3 space-y-1 list-decimal list-inside">
          <li>Tocá "Abrir publicación" para ir al posteo de la página</li>
          <li>En Facebook: <span className="font-bold">Share → Share to a group</span></li>
          <li>Buscá <span className="font-bold">"{currentGroup.group_name}"</span> y publicá</li>
          <li>Volvé acá y confirmá</li>
        </ol>

        {/* Botón abrir publicación */}
        {pageUrl && (
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 hover:bg-blue-100 transition-colors mb-3"
          >
            Abrir publicación de la página <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {/* URL del post (opcional) */}
        <div className="mb-3">
          <input
            type="url"
            value={currentPostUrl}
            onChange={e => setCurrentPostUrl(e.target.value)}
            placeholder="URL del post compartido (opcional)"
            className="w-full px-3 py-2 rounded-xl text-xs border border-brand-accent focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 outline-none"
          />
        </div>

        {/* Botones */}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            ) : (
              <><Check className="w-4 h-4" /> Listo</>
            )}
          </button>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl font-bold text-sm transition-all bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
          >
            Saltar <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grupos completados */}
      {completed.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {completed.map((g, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
              <Check className="w-2.5 h-2.5" /> {g.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
