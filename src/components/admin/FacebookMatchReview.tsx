import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/src/lib/utils';
import { api } from '@/src/lib/api';
import { Check, XCircle, ChevronLeft, ChevronRight, Loader2, ImageIcon } from 'lucide-react';

interface MatchItem {
  id: string; source_type: string; source_id: string; source_label: string;
  target_type: string; target_id: string; target_label: string;
  score: number; reasons: string[]; method: string; status: string;
  created_at: string;
}

interface Props {
  matches: MatchItem[];
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onRefresh: () => void;
}

type SideItem = {
  id: string; type: string; label: string; content: string; images: string[];
  species?: string; color?: string; location?: string; phone?: string; date?: string;
};

export default function FacebookMatchReview({ matches, onConfirm, onReject, onRefresh }: Props) {
  const [index, setIndex] = useState(0);
  const [source, setSource] = useState<SideItem | null>(null);
  const [target, setTarget] = useState<SideItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [srcImgIdx, setSrcImgIdx] = useState(0);
  const [tgtImgIdx, setTgtImgIdx] = useState(0);

  const pending = matches.filter(m => m.status === 'pending');

  const fetchSideData = useCallback(async (m: MatchItem) => {
    setLoading(true);
    try {
      const [srcData, tgtData] = await Promise.all([
        m.source_type === 'fb_post'
          ? api.facebook.posts.get(m.source_id).then(r => ({ id: r.id, type: 'fb_post', label: r.content?.substring(0, 100), content: r.content, images: r.image_urls || [], species: r.species, color: r.color, location: r.location_hint, phone: r.phone, date: r.posted_at }))
          : api.pets.get(m.source_id).then(r => ({ id: r.id, type: 'app_pet', label: r.name, content: r.description || '', images: r.images?.map((i: any) => i.url) || [], species: r.species, color: r.color, location: r.location_hint, phone: r.phone, date: r.created_at })),
        m.target_type === 'fb_post'
          ? api.facebook.posts.get(m.target_id).then(r => ({ id: r.id, type: 'fb_post', label: r.content?.substring(0, 100), content: r.content, images: r.image_urls || [], species: r.species, color: r.color, location: r.location_hint, phone: r.phone, date: r.posted_at }))
          : api.pets.get(m.target_id).then(r => ({ id: r.id, type: 'app_pet', label: r.name, content: r.description || '', images: r.images?.map((i: any) => i.url) || [], species: r.species, color: r.color, location: r.location_hint, phone: r.phone, date: r.created_at })),
      ]);
      setSource(srcData);
      setTarget(tgtData);
      setSrcImgIdx(0);
      setTgtImgIdx(0);
    } catch (e) { console.error('Error fetching match data:', e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pending.length > 0 && index < pending.length) {
      fetchSideData(pending[index]);
    }
  }, [index, pending.length, fetchSideData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') { if (pending[index]) onConfirm(pending[index].id); }
      if (e.key === 'r' || e.key === 'R') { if (pending[index]) onReject(pending[index].id); }
      if (e.key === 'ArrowLeft') setIndex(Math.max(0, index - 1));
      if (e.key === 'ArrowRight') setIndex(Math.min(pending.length - 1, index + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, pending, onConfirm, onReject]);

  if (pending.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Check className="w-12 h-12 mx-auto mb-3 text-green-400" />
        <p className="font-bold text-lg">No hay matches pendientes</p>
        <p className="text-sm mt-1">Todos los matches fueron revisados.</p>
      </div>
    );
  }

  const current = pending[index];

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Match {index + 1} de {pending.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex gap-0.5">
            {pending.slice(0, 20).map((m, i) => (
              <button key={i} onClick={() => setIndex(i)}
                className={cn("w-4 h-1 rounded-full transition-all",
                  i === index ? "bg-brand-primary h-1.5" : m.status === 'pending' ? "bg-gray-300" : m.status === 'confirmed' ? "bg-green-300" : "bg-red-300"
                )} />
            ))}
          </div>
          <button onClick={() => setIndex(Math.min(pending.length - 1, index + 1))} disabled={index >= pending.length - 1}
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Score banner */}
      <div className={cn("text-center py-3 rounded-2xl font-black text-lg",
        current.score >= 80 ? "bg-green-50 text-green-700" : current.score >= 60 ? "bg-yellow-50 text-yellow-700" : "bg-gray-50 text-gray-500"
      )}>
        Score: {current.score}%
      </div>

      {/* Side-by-side */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source */}
          <SideCard side={source} label={current.source_label} type={current.source_type}
            imgIdx={srcImgIdx} setImgIdx={setSrcImgIdx} title="Fuente" />

          {/* Target */}
          <SideCard side={target} label={current.target_label} type={current.target_type}
            imgIdx={tgtImgIdx} setImgIdx={setTgtImgIdx} title="Target" />
        </div>
      )}

      {/* Reasons */}
      {current.reasons?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {current.reasons.map((r, i) => (
            <span key={i} className="text-xs px-2.5 py-1 bg-brand-bg rounded-full text-gray-600 font-medium">{r}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4 pt-2">
        <button onClick={() => onReject(current.id)}
          className="flex items-center gap-2 px-8 py-3 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-colors text-base">
          <XCircle className="w-5 h-5" /> Rechazar <span className="text-xs text-red-400 ml-1">(R)</span>
        </button>
        <button onClick={() => onConfirm(current.id)}
          className="flex items-center gap-2 px-8 py-3 bg-green-50 text-green-700 font-bold rounded-2xl hover:bg-green-100 transition-colors text-base">
          <Check className="w-5 h-5" /> Confirmar <span className="text-xs text-green-400 ml-1">(C)</span>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">Usá las flechas ← → para navegar</p>
    </div>
  );
}

function SideCard({ side, label, type, imgIdx, setImgIdx, title }: {
  side: SideItem | null; label: string; type: string; imgIdx: number; setImgIdx: (i: number) => void; title: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-accent overflow-hidden">
      <div className="px-4 py-2 bg-brand-bg text-[10px] uppercase font-bold text-gray-500 tracking-wider">{title} — {type === 'fb_post' ? 'Post Facebook' : 'Mascota App'}</div>
      <div className="relative bg-gray-50 aspect-square">
        {side && side.images.length > 0 ? (
          <>
            <img src={side.images[imgIdx]} alt="" className="w-full h-full object-cover" />
            {side.images.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {side.images.map((_, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className={cn("w-1.5 h-1.5 rounded-full transition-all", i === imgIdx ? "bg-white w-3" : "bg-white/50")}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300"><ImageIcon className="w-12 h-12" /></div>
        )}
      </div>
      <div className="p-3 space-y-1.5 text-xs">
        <p className="font-medium text-gray-700 line-clamp-3">{label || 'Sin contenido'}</p>
        {side && (
          <>
            {side.species && <p className="text-gray-500">Especie: {side.species}</p>}
            {side.color && <p className="text-gray-500">Color: {side.color}</p>}
            {side.location && <p className="text-gray-500">Ubicación: {side.location}</p>}
            {side.phone && <p className="text-gray-500">Tel: {side.phone}</p>}
            {side.date && <p className="text-gray-400">{new Date(side.date).toLocaleDateString('es-AR')}</p>}
          </>
        )}
      </div>
    </div>
  );
}
