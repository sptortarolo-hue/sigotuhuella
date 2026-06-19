import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, PawPrint, MapPin, Phone, Calendar, Shield, MessageSquare, Camera,
  Globe, Instagram, QrCode, ExternalLink, ChevronRight, ChevronDown, User, Heart
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-brand-accent rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-brand-bg/50 hover:bg-brand-bg transition-colors text-left"
      >
        <div className="flex items-center gap-2 font-bold text-sm text-brand-primary">
          {icon}
          {title}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PetDetailPanelProps {
  data: any;
  onSelectUser?: (userId: string) => void;
  isMobile?: boolean;
  onClose?: () => void;
}

export default function PetDetailPanel({ data, onSelectUser, isMobile, onClose }: PetDetailPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'images' | 'relations'>('info');
  const { pet, created_by_user, facebook_posts, instagram_posts, whatsapp_messages, facebook_matches, qr_identifiers } = data;

  const statusLabels: Record<string, string> = {
    lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado',
    accidented: 'Accidentado', needs_attention: 'Necesita Atención',
    for_adoption: 'En Adopción', adopted: 'Adoptado', reunited: 'Reencontrado',
  };
  const statusColors: Record<string, string> = {
    lost: 'bg-red-100 text-red-700', retained: 'bg-amber-100 text-amber-700',
    sighted: 'bg-blue-100 text-blue-700', accidented: 'bg-orange-100 text-orange-700',
    needs_attention: 'bg-yellow-100 text-yellow-700', for_adoption: 'bg-purple-100 text-purple-700',
    adopted: 'bg-emerald-100 text-emerald-700', reunited: 'bg-emerald-100 text-emerald-700',
  };
  const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species;

  return (
    <div className={cn("space-y-4", isMobile ? "p-4" : "p-6")}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {pet.images?.[0]?.image_data || pet.images?.[0]?.external_url ? (
            <img
              src={pet.images[0].external_url || `data:${pet.images[0].mime_type || 'image/jpeg'};base64,${pet.images[0].image_data}`}
              alt=""
              className="w-14 h-14 rounded-2xl object-cover border-2 border-brand-accent shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center border-2 border-brand-accent shrink-0">
              <PawPrint className="w-7 h-7 text-brand-primary" />
            </div>
          )}
          <div>
            <h3 className="font-bold text-brand-primary text-lg">{pet.name || 'Sin nombre'}</h3>
            <p className="text-xs text-gray-500">{speciesLabel}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <span className={cn("text-[10px] px-2.5 py-1 rounded-full font-bold uppercase", statusColors[pet.status] || 'bg-gray-100 text-gray-500')}>
          {statusLabels[pet.status] || pet.status}
        </span>
        {pet.is_admin_verified && (
          <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-green-100 text-green-700">
            <Shield className="w-3 h-3 inline mr-1" /> Verificado
          </span>
        )}
        {pet.case_number && (
          <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-gray-100 text-gray-500">
            {pet.case_number}
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-brand-accent gap-0">
        {[
          { id: 'info', label: 'Info' },
          { id: 'images', label: `Fotos (${pet.images?.length || 0})` },
          { id: 'relations', label: 'Relaciones' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "px-4 py-2 text-xs font-bold transition-all relative",
              activeSubTab === tab.id ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
            )}
          >
            {tab.label}
            {activeSubTab === tab.id && (
              <motion.div layoutId="pet-subtab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {activeSubTab === 'info' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <PawPrint className="w-4 h-4 shrink-0" />
              <span>Especie: {speciesLabel}</span>
            </div>
            {pet.breed && <div className="flex items-center gap-2 text-gray-500"><PawPrint className="w-4 h-4 shrink-0" /><span>Raza: {pet.breed}</span></div>}
            {pet.color && <div className="flex items-center gap-2 text-gray-500"><PawPrint className="w-4 h-4 shrink-0" /><span>Color: {pet.color}</span></div>}
            {pet.gender && <div className="flex items-center gap-2 text-gray-500"><PawPrint className="w-4 h-4 shrink-0" /><span>Sexo: {pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : pet.gender}</span></div>}
            {pet.age && <div className="flex items-center gap-2 text-gray-500"><Calendar className="w-4 h-4 shrink-0" /><span>Edad: {pet.age}</span></div>}
            {pet.size && <div className="flex items-center gap-2 text-gray-500"><PawPrint className="w-4 h-4 shrink-0" /><span>Tamaño: {pet.size}</span></div>}
            <div className="flex items-center gap-2 text-gray-500">
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="truncate">{pet.location}</span>
            </div>
            {pet.contact_info && (
              <div className="flex items-center gap-2 text-gray-500">
                <Phone className="w-4 h-4 shrink-0" />
                <span>{pet.contact_info}{pet.contact_info_2 ? ` / ${pet.contact_info_2}` : ''}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-500">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Creado: {new Date(pet.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Created by */}
          {created_by_user && (
            <div
              className="border border-brand-accent rounded-2xl p-4 hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => onSelectUser?.(created_by_user.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-brand-primary">{created_by_user.display_name || 'Sin nombre'}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      created_by_user.role === 'admin' ? 'bg-brand-primary/10 text-brand-primary' : 'bg-gray-100 text-gray-500'
                    )}>{created_by_user.role}</span>
                  </div>
                  <p className="text-xs text-gray-500">{created_by_user.email}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
              </div>
            </div>
          )}

          {/* Health info */}
          {(pet.is_vaccinated || pet.is_sterilized || pet.is_dewormed) && (
            <div className="flex flex-wrap gap-2">
              {pet.is_vaccinated && <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-green-100 text-green-700">💉 Vacunado</span>}
              {pet.is_sterilized && <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-blue-100 text-blue-700">✂️ Esterilizado</span>}
              {pet.is_dewormed && <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-amber-100 text-amber-700">🪱 Desparasitado</span>}
            </div>
          )}

          {pet.description && (
            <div className="border border-brand-accent rounded-2xl p-4">
              <h4 className="font-bold text-xs text-gray-400 uppercase tracking-widest mb-2">Descripción</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{pet.description}</p>
            </div>
          )}

          <div className="text-[10px] text-gray-400">
            {pet.instagram && <span className="mr-3">📷 IG: {pet.instagram}</span>}
            {pet.source_type && <span className="mr-3">Fuente: {pet.source_type}</span>}
            {pet.is_admin_verified !== undefined && <span>Admin: {pet.is_admin_verified ? '✅ Verificado' : '❌ No verificado'}</span>}
          </div>
        </div>
      )}

      {/* Images tab */}
      {activeSubTab === 'images' && (
        <div>
          {!pet.images || pet.images.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Sin imágenes</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pet.images.map((img: any, i: number) => (
                <div key={img.id} className="aspect-square rounded-xl overflow-hidden border border-brand-accent bg-brand-bg relative group">
                  <img
                    src={img.external_url || `data:${img.mime_type || 'image/jpeg'};base64,${img.image_data}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button className="p-1.5 bg-white/90 rounded-lg text-xs font-bold text-red-600 hover:bg-white">Eliminar</button>
                  </div>
                  {i === 0 && (
                    <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-brand-primary/90 text-white">
                      Principal
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Relations tab */}
      {activeSubTab === 'relations' && (
        <div className="space-y-4">
          {/* Facebook posts */}
          {facebook_posts?.length > 0 && (
            <Section title={`Facebook (${facebook_posts.length})`} icon={<Globe className="w-4 h-4" />}>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {facebook_posts.map((fp: any) => (
                  <div key={fp.id} className="p-3 bg-gray-50 rounded-xl text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-xs truncate">{fp.author_name || 'Anónimo'}</span>
                      {fp.posted_at && <span className="text-[10px] text-gray-400 shrink-0">{new Date(fp.posted_at).toLocaleDateString()}</span>}
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-1">{fp.content}</p>
                    {fp.fb_post_url && (
                      <a href={fp.fb_post_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
                        Ver post <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <div className="flex gap-1 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100">{fp.classification}</span>
                      {fp.is_matched && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-green-100 text-green-700">Matched</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Instagram posts */}
          {instagram_posts?.length > 0 && (
            <Section title={`Instagram (${instagram_posts.length})`} icon={<Instagram className="w-4 h-4" />}>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {instagram_posts.map((ig: any) => (
                  <div key={ig.id} className="p-3 bg-gray-50 rounded-xl text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        ig.status === 'published' ? 'bg-green-100 text-green-700' :
                        ig.status === 'queued' ? 'bg-blue-100 text-blue-700' :
                        ig.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100'
                      )}>{ig.status}</span>
                      {ig.published_at && <span className="text-[10px] text-gray-400">{new Date(ig.published_at).toLocaleDateString()}</span>}
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{ig.caption}</p>
                    {ig.ig_permalink && (
                      <a href={ig.ig_permalink} target="_blank" rel="noreferrer" className="text-[10px] text-pink-500 hover:underline flex items-center gap-1 mt-1">
                        Ver en IG <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {ig.error_message && <p className="text-[10px] text-red-500 mt-1">{ig.error_message}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* WhatsApp messages */}
          {whatsapp_messages?.length > 0 && (
            <Section title={`WhatsApp (${whatsapp_messages.length})`} icon={<MessageSquare className="w-4 h-4" />}>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {whatsapp_messages.map((wm: any) => (
                  <div key={wm.id} className="p-3 bg-gray-50 rounded-xl text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold truncate">{wm.sender_name || wm.wa_from}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        wm.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      )}>{wm.direction === 'inbound' ? 'Recibido' : 'Enviado'}</span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{wm.text_body || '(imagen)'}</p>
                    <span className="text-[10px] text-gray-400">{new Date(wm.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Facebook matches */}
          {facebook_matches?.length > 0 && (
            <Section title={`Matches (${facebook_matches.length})`} icon={<Heart className="w-4 h-4" />}>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {facebook_matches.map((m: any) => (
                  <div key={m.id} className="p-3 bg-gray-50 rounded-xl text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        m.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        m.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      )}>{m.status}</span>
                      <span className="text-[10px] font-bold text-brand-primary">Score: {m.score}</span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{m.related_fb_content || m.fb_content || '-'}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                      <span>{m.method}</span>
                      {m.related_fb_post_id && <span>FB: {m.related_fb_post_id}</span>}
                      {m.fb_post_id && <span>FB: {m.fb_post_id}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* QR codes */}
          {qr_identifiers?.length > 0 && (
            <Section title={`QR Codes (${qr_identifiers.length})`} icon={<QrCode className="w-4 h-4" />}>
              <div className="space-y-2">
                {qr_identifiers.map((qr: any) => (
                  <div key={qr.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                    <div>
                      <span className="font-bold text-brand-primary">{qr.code}</span>
                      <div className="text-[10px] text-gray-400">
                        {qr.assigned_at ? `Asignado: ${new Date(qr.assigned_at).toLocaleDateString()}` : 'Sin asignar'}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{qr.share_token?.slice(0, 8)}...</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(!facebook_posts?.length && !instagram_posts?.length && !whatsapp_messages?.length && !facebook_matches?.length && !qr_identifiers?.length) && (
            <p className="text-gray-400 text-sm text-center py-8">Sin relaciones registradas</p>
          )}
        </div>
      )}
    </div>
  );
}
