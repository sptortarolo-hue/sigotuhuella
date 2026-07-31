import React from 'react';
import { cn } from '@/src/lib/utils';
import { ExternalLink, MessageSquare, Users, Globe, Smartphone } from 'lucide-react';

interface LastPostData {
  pet_id: string;
  pet_name: string;
  pet_species: string;
  pet_breed: string;
  pet_status: string;
  caption: string;
  image_url: string;
  permalink?: string;
  page_post_id?: string;
  groups_count?: number;
  published_at: string;
}

interface LastPostPreviewProps {
  instagram: LastPostData | null;
  facebook: LastPostData | null;
  whatsapp: LastPostData | null;
}

const statusLabels: Record<string, string> = {
  lost: 'PERDIDO',
  for_adoption: 'EN ADOPCIÓN',
  adopted: 'ADOPTADO',
  reunited: 'REENCUENTRO',
  sighted: 'AVISTADO',
  retained: 'RETENIDO',
  accidented: 'ACCIDENTADO',
  needs_attention: 'NECESITA ATENCIÓN',
  transitada: 'EN TRÁNSITO',
};

const speciesLabels: Record<string, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otro',
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function PostCard({ data, platform, icon }: { data: LastPostData; platform: string; icon: React.ReactNode }) {
  const statusLabel = statusLabels[data.pet_status] || data.pet_status;
  const speciesLabel = speciesLabels[data.pet_species] || data.pet_species;

  return (
    <div className="flex gap-4 p-4 bg-white rounded-2xl border border-brand-accent">
      <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden shrink-0 bg-brand-bg">
        <img
          src={data.image_url}
          alt={data.pet_name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs font-bold text-gray-500">{platform}</span>
          <span className="text-[10px] text-gray-400">·</span>
          <span className="text-[10px] text-gray-400">{formatTime(data.published_at)}</span>
        </div>
        <h4 className="font-bold text-brand-primary text-sm truncate">
          {data.pet_name} — {speciesLabel}{data.pet_breed ? `, ${data.pet_breed}` : ''}
        </h4>
        <span className="inline-block text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full mt-0.5">
          {statusLabel}
        </span>
        <p className="text-xs text-gray-500 line-clamp-3 mt-1 whitespace-pre-line">
          {data.caption}
        </p>
        <div className="flex items-center gap-3 mt-2">
          {data.permalink && (
            <a href={data.permalink} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Ver publicación
            </a>
          )}
          {data.page_post_id && (
            <span className="text-[10px] text-gray-400">Post ID: {data.page_post_id}</span>
          )}
          {data.groups_count !== undefined && data.groups_count > 0 && (
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Users className="w-3 h-3" /> {data.groups_count} grupos
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LastPostPreview({ instagram, facebook, whatsapp }: LastPostPreviewProps) {
  const hasAny = instagram || facebook || whatsapp;

  if (!hasAny) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-lg font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
          Última Publicación
        </h2>
        <p className="text-sm text-gray-400 text-center py-8">No hay publicaciones recientes.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
      <h2 className="text-lg font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
        Última Publicación
      </h2>
      <div className="space-y-3">
        {instagram && (
          <PostCard data={instagram} platform="Instagram" icon={<Globe className="w-3 h-3 text-pink-500" />} />
        )}
        {facebook && (
          <PostCard data={facebook} platform="Facebook" icon={<MessageSquare className="w-3 h-3 text-blue-600" />} />
        )}
        {whatsapp && (
          <PostCard data={whatsapp} platform="WhatsApp" icon={<Smartphone className="w-3 h-3 text-emerald-600" />} />
        )}
      </div>
    </div>
  );
}
