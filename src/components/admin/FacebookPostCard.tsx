import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  ExternalLink, FlaskConical, RefreshCw, Trash2, MessageSquare, Image as ImageIcon, MapPin, Phone,
} from 'lucide-react';

interface FacebookPost {
  id: string; group_id: string; group_name: string; fb_post_id: string; fb_post_url: string;
  author_name: string; content: string; image_urls: string[]; classification: string;
  species: string; color: string; location_hint: string; phone: string; is_matched: boolean;
  posted_at: string; created_at: string;
}

interface Props {
  post: FacebookPost;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onClassify: (id: string) => void;
  onDelete: (id: string) => void;
  onMatch: (id: string) => void;
  onViewDetail: (post: FacebookPost) => void;
  onUpdateClassification?: (id: string, classification: string) => void;
  onImageClick?: (urls: string[], index: number) => void;
}

const clsStyles: Record<string, string> = {
  lost: 'bg-red-100 text-red-700 border-red-200',
  found: 'bg-green-100 text-green-700 border-green-200',
  reunion: 'bg-blue-100 text-blue-700 border-blue-200',
  adoption: 'bg-purple-100 text-purple-700 border-purple-200',
  other: 'bg-gray-100 text-gray-500 border-gray-200',
  unclassified: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

const clsLabels: Record<string, string> = {
  lost: 'Perdido', found: 'Encontrado', reunion: 'Reunión', adoption: 'Adopción',
  other: 'Otro', unclassified: 'Sin clasificar',
};

export default function FacebookPostCard({ post, selected, onToggleSelect, onClassify, onDelete, onMatch, onViewDetail, onUpdateClassification, onImageClick }: Props) {
  const [imgIdx, setImgIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const hasImages = post.image_urls && post.image_urls.length > 0;
  const showImg = hasImages && !imgFailed;
  useEffect(() => { setImgFailed(false); }, [imgIdx]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white rounded-2xl border overflow-hidden transition-all",
        selected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-brand-accent hover:shadow-md"
      )}
    >
      {/* Image */}
      <div className={cn("relative bg-gray-50", showImg ? "aspect-[4/3]" : "aspect-[4/3] flex items-center justify-center")}>
        {showImg ? (
          <>
            <img src={post.image_urls[imgIdx]} alt="" referrerPolicy="no-referrer"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => onImageClick?.(post.image_urls, imgIdx)}
              onError={() => setImgFailed(true)}
            />
            {post.image_urls.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {post.image_urls.map((_, i) => (
                  <button key={i} onClick={e => { e.stopPropagation(); setImgIdx(i); }}
                    className={cn("w-1.5 h-1.5 rounded-full transition-all", i === imgIdx ? "bg-white w-3" : "bg-white/50")}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <ImageIcon className="w-10 h-10 text-gray-300" />
        )}
        {/* Checkbox */}
        <div className="absolute top-2 left-2" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(post.id)}
            className="w-4 h-4 rounded accent-brand-primary cursor-pointer" />
        </div>
        {/* Classification badge */}
        <div className="absolute top-2 right-2">
          {onUpdateClassification ? (
            <select value={post.classification} onChange={e => onUpdateClassification(post.id, e.target.value)}
              onClick={e => e.stopPropagation()}
              className={cn("text-[10px] px-2 py-1 rounded-full font-bold uppercase border outline-none cursor-pointer appearance-none", clsStyles[post.classification] || clsStyles.unclassified)}>
              <option value="unclassified">Sin clasificar</option>
              <option value="lost">Perdido</option>
              <option value="found">Encontrado</option>
              <option value="reunion">Reunión</option>
              <option value="adoption">Adopción</option>
              <option value="other">Otro</option>
            </select>
          ) : (
            <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold uppercase border", clsStyles[post.classification] || clsStyles.unclassified)}>
              {clsLabels[post.classification] || post.classification}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 space-y-2">
        <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed cursor-pointer hover:text-brand-primary"
          onClick={() => onViewDetail(post)}>
          {post.content || 'Sin contenido'}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {post.species && (
            <span className="text-[10px] px-2 py-0.5 bg-brand-bg rounded-full font-bold text-gray-600">
              {post.species === 'dog' ? '🐕 Perro' : post.species === 'cat' ? '😺 Gato' : post.species}
            </span>
          )}
          {post.location_hint && (
            <span className="text-[10px] px-2 py-0.5 bg-brand-bg rounded-full text-gray-500 flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" /> {post.location_hint}
            </span>
          )}
          {post.phone && (
            <span className="text-[10px] px-2 py-0.5 bg-brand-bg rounded-full text-gray-500 flex items-center gap-0.5">
              <Phone className="w-2.5 h-2.5" /> {post.phone}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100">
          <span className="truncate max-w-[150px]">{post.group_name || ''}</span>
          <span>{post.posted_at ? new Date(post.posted_at).toLocaleDateString('es-AR') : ''}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1">
          <button onClick={() => onClassify(post.id)} title="Clasificar con Gemini"
            className="p-1.5 text-gray-400 hover:text-brand-primary transition-colors rounded-lg hover:bg-brand-bg">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onMatch(post.id)} title="Buscar matches"
            className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-brand-bg">
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
          {post.fb_post_url && (
            <a href={post.fb_post_url} target="_blank" rel="noopener noreferrer" title="Abrir en Facebook"
              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-brand-bg">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={() => onDelete(post.id)} title="Eliminar"
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 ml-auto">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
