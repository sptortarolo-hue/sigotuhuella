import { useState, useEffect } from 'react';
import { Check, Plus, Trash2, UserCheck, Users } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getFbSearchGroups, getPetCoverage, type PetGroupCoverageEntry } from '@/src/lib/volunteerService';

export interface SelectedShareGroup {
  name: string;
  url?: string;
}

interface SuggestedGroup {
  id: string;
  group_name: string;
  group_url: string | null;
}

const normGroupName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
const daysAgo = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

interface ShareGroupsPickerProps {
  petId: string;
  selected: SelectedShareGroup[];
  onChange: (groups: SelectedShareGroup[]) => void;
}

export default function ShareGroupsPicker({ petId, selected, onChange }: ShareGroupsPickerProps) {
  const [suggestedGroups, setSuggestedGroups] = useState<SuggestedGroup[]>([]);
  const [coverage, setCoverage] = useState<PetGroupCoverageEntry[]>([]);
  const [customGroupName, setCustomGroupName] = useState('');

  useEffect(() => {
    let alive = true;
    getFbSearchGroups().then(groups => {
      if (alive) setSuggestedGroups(groups || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    getPetCoverage(petId).then(cov => {
      if (alive) setCoverage(cov || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, [petId]);

  const coverageMap = new Map<string, PetGroupCoverageEntry>();
  coverage.forEach(c => coverageMap.set(normGroupName(c.group_name), c));
  const coverageFor = (name?: string | null): PetGroupCoverageEntry | undefined =>
    name ? coverageMap.get(normGroupName(name)) : undefined;

  const addCustomGroup = () => {
    const name = customGroupName.trim();
    if (!name) return;
    if (!selected.some(s => normGroupName(s.name) === normGroupName(name))) {
      onChange([...selected, { name }]);
    }
    setCustomGroupName('');
  };

  const toggleSuggested = (g: SuggestedGroup) => {
    if (selected.some(s => normGroupName(s.name) === normGroupName(g.group_name))) {
      onChange(selected.filter(s => normGroupName(s.name) !== normGroupName(g.group_name)));
    } else {
      onChange([...selected, { name: g.group_name, url: g.group_url || undefined }]);
    }
  };

  const removeAt = (i: number) => onChange(selected.filter((_, j) => j !== i));

  return (
    <div className="bg-brand-bg rounded-2xl p-4 border border-brand-accent">
      <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-widest flex items-center gap-2">
        <Users className="w-3.5 h-3.5" /> ¿En qué grupo compartiste?
      </p>
      <p className="text-[11px] text-gray-400 mb-3">Seleccioná los grupos donde publicaste (opcional)</p>

      {coverage.length > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 flex items-start gap-1.5">
          <UserCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Los grupos marcados ya fueron compartidos recientemente por otros voluntarios.
        </p>
      )}

      {suggestedGroups.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestedGroups.map(g => {
            const isSelected = selected.some(s => normGroupName(s.name) === normGroupName(g.group_name));
            const cov = coverageFor(g.group_name);
            const isCovered = !!cov && !isSelected;
            return (
              <button
                key={g.id}
                onClick={() => toggleSuggested(g)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                  isSelected
                    ? "bg-brand-primary text-white border-brand-primary"
                    : isCovered
                      ? "bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500"
                      : "bg-white text-gray-600 border-brand-accent hover:border-brand-primary"
                )}
              >
                {isSelected ? (
                  <Check className="w-3 h-3" />
                ) : cov ? (
                  <UserCheck className="w-3 h-3 shrink-0" />
                ) : null}
                <span className="flex flex-col items-start leading-tight">
                  <span>{g.group_name}</span>
                  {isCovered && (
                    <span className="text-[9px] font-semibold opacity-80 whitespace-nowrap">
                      Cubierto por {cov!.volunteer || 'otro voluntario'} · hace {daysAgo(cov!.date)}d
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={customGroupName}
          onChange={e => setCustomGroupName(e.target.value)}
          placeholder="Grupo personalizado..."
          className="flex-1 px-3 py-2 rounded-xl text-xs border border-brand-accent focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 outline-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && customGroupName.trim()) {
              e.preventDefault();
              addCustomGroup();
            }
          }}
        />
        <button
          onClick={addCustomGroup}
          disabled={!customGroupName.trim()}
          aria-label="Agregar grupo"
          className="px-3 py-2 rounded-xl text-xs font-bold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">Los grupos nuevos que agregues quedan sugeridos para todo el equipo.</p>

      {(() => {
        const cov = coverageFor(customGroupName.trim() || null);
        return cov && customGroupName.trim() ? (
          <p className="mt-1.5 text-[11px] text-amber-700 flex items-center gap-1">
            <UserCheck className="w-3 h-3 shrink-0" />
            Ya compartido por {cov.volunteer || 'otro voluntario'} · hace {daysAgo(cov.date)}d
          </p>
        ) : null;
      })()}

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((g, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[11px] font-bold">
              {g.name}
              <button onClick={() => removeAt(i)} className="hover:text-red-500" aria-label={'Quitar ' + g.name}>
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
