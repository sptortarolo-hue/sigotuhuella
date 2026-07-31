import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, PawPrint, MapPin, Phone, Calendar, Shield, MessageSquare, Camera,
  Globe, Instagram, QrCode, ExternalLink, ChevronRight, ChevronDown, User, Heart, HeartHandshake,
  Layers, Home, History as HistoryIcon, Users, ArrowUpRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import ReunionModal from '@/src/components/ReunionModal';
import { getPetImageUrl, getPetImageUrls } from '@/src/lib/petService';
import { api } from '@/src/lib/api';
import PetGroupTransitModal from '@/src/components/admin/PetGroupTransitModal';

function petImageAt(pet: any, idx: number): string | undefined {
  if (!pet?.images?.[idx]) return undefined;
  const img = pet.images[idx];
  if (img.image_data) return `data:${img.mime_type || 'image/jpeg'};base64,${img.image_data}`;
  if (img.external_url) return img.external_url;
  if (img.has_image) return `/api/images/pet-thumb/${pet.id}/${idx}`;
  return undefined;
}

function petAllImages(pet: any): string[] {
  return pet?.images?.map((img: any, idx: number) => {
    if (img.image_data) return `data:${img.mime_type || 'image/jpeg'};base64,${img.image_data}`;
    if (img.external_url) return img.external_url;
    if (img.has_image) return `/api/images/pet-thumb/${pet.id}/${idx}`;
    return '';
  }).filter(Boolean) || [];
}

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
  pets?: any[];
  users?: any[];
  onRefresh?: () => void;
}

export default function PetDetailPanel({ data, onSelectUser, isMobile, onClose, pets, users, onRefresh }: PetDetailPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'images' | 'owner' | 'relations' | 'group' | 'history'>('info');
  const [showReunionModal, setShowReunionModal] = useState(false);
  const [showModal, setShowModal] = useState<null | 'group' | 'transit'>(null);
  const { pet, created_by_user, facebook_posts, instagram_posts, whatsapp_messages, facebook_matches, qr_identifiers, group_members, history } = data;

  const refresh = () => { onRefresh?.(); };

  const statusLabels: Record<string, string> = {
    lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado',
    accidented: 'Accidentado', needs_attention: 'Necesita Atención',
    for_adoption: 'En Adopción', for_adoption_simple: 'Adopción (Difusión)', adopted: 'Adoptado', reunited: 'Reencontrado',
    transitada: 'En Tránsito',
  };
  const statusColors: Record<string, string> = {
    lost: 'bg-red-100 text-red-700', retained: 'bg-amber-100 text-amber-700',
    sighted: 'bg-blue-100 text-blue-700', accidented: 'bg-orange-100 text-orange-700',
    needs_attention: 'bg-yellow-100 text-yellow-700', for_adoption: 'bg-purple-100 text-purple-700', for_adoption_simple: 'bg-orange-100 text-orange-700',
    adopted: 'bg-emerald-100 text-emerald-700', reunited: 'bg-emerald-100 text-emerald-700',
    transitada: 'bg-teal-100 text-teal-700',
  };
  const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species;

  const isGroupedMember = !!pet.group_id;

  function historyEventLabel(type: string): string {
    const labels: Record<string, string> = {
      status_change: 'Cambio de estado',
      grouped: 'Reporte agrupado',
      ungrouped: 'Reporte desagrupado',
      transit_assigned: 'Puesta en tránsito',
      transit_exited: 'Salida de tránsito',
    };
    return labels[type] || type;
  }

  return (
    <div className={cn("space-y-4", isMobile ? "p-4" : "p-6")}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {pet.images?.[0]?.image_data || pet.images?.[0]?.external_url || pet.images?.[0]?.has_image ? (
            <img
              src={petImageAt(pet, 0)}
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

      {/* Group + transit actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowModal('group')}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-brand-bg text-brand-primary font-bold border border-brand-accent hover:border-brand-primary/50 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" /> Agrupar reporte
        </button>
        {pet.status === 'transitada' ? (
          <button
            onClick={async () => {
              if (!confirm('¿Sacar la mascota de tránsito y pasarla a adopción?')) return;
              try { await api.pets.exitTransit(pet.id); refresh(); } catch (e: any) { alert(e?.message || 'Error al salir de tránsito'); }
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-teal-50 text-teal-700 font-bold border border-teal-200 hover:bg-teal-100 transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Salir de tránsito
          </button>
        ) : (
          <button
            onClick={() => setShowModal('transit')}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-teal-50 text-teal-700 font-bold border border-teal-200 hover:bg-teal-100 transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Poner en tránsito
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-brand-accent gap-0 overflow-x-auto">
        {[
          { id: 'info', label: 'Info' },
          { id: 'images', label: `Fotos (${pet.images?.length || 0})` },
          { id: 'owner', label: 'Dueño' },
          { id: 'group', label: `Grupo (${group_members?.length || 0})` },
          { id: 'history', label: `Historial (${history?.length || 0})` },
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
                    src={petImageAt(pet, i)}
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

      {/* Owner tab */}
      {activeSubTab === 'owner' && (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-brand-primary flex items-center gap-2">
              <HeartHandshake className="w-4 h-4" /> Datos del dueño
            </h3>
            <button onClick={() => setShowReunionModal(true)}
              className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1">
              <HeartHandshake className="w-3.5 h-3.5" /> {pet.owner_name ? 'Editar datos' : 'Completar datos'}
            </button>
          </div>
          {pet.reunited_at && (
            <p className="text-xs text-emerald-600 font-medium">
              {pet.status === 'reunited' ? 'Reencontrada' : 'Adoptada'} el {new Date(pet.reunited_at).toLocaleDateString('es-AR')}
            </p>
          )}
          {(pet.owner_name || pet.owner_phone || pet.owner_email || pet.owner_address) ? (
            <div className="space-y-3">
              {pet.owner_name && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                  <User className="w-4 h-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Nombre</p>
                    <p className="font-medium">{pet.owner_name}</p>
                  </div>
                </div>
              )}
              {pet.owner_phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                  <Phone className="w-4 h-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Teléfono</p>
                    <a href={`https://wa.me/54${pet.owner_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                      className="font-medium text-emerald-600 hover:underline">{pet.owner_phone}</a>
                  </div>
                </div>
              )}
              {pet.owner_email && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                  <MessageSquare className="w-4 h-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Email</p>
                    <a href={`mailto:${pet.owner_email}`} className="font-medium text-brand-primary hover:underline">{pet.owner_email}</a>
                  </div>
                </div>
              )}
              {pet.owner_address && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm">
                  <MapPin className="w-4 h-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Dirección</p>
                    <p className="font-medium">{pet.owner_address}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <HeartHandshake className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin datos del dueño cargados.</p>
              <p className="text-xs mt-1">Hacé click en "Completar datos" para agregar la información.</p>
            </div>
          )}
        </div>
      )}

      {/* Group tab */}
      {activeSubTab === 'group' && (
        <div className="space-y-4">
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl">
            <div className="flex items-center gap-2 text-sm font-bold text-teal-800">
              <Home className="w-4 h-4" />
              {pet.status === 'transitada' ? 'En tránsito' : 'Estado actual: ' + (statusLabels[pet.status] || pet.status)}
            </div>
            <p className="text-xs text-teal-700 mt-1">
              {pet.transit_caregiver_id
                ? 'Asignada a un usuario responsable del tránsito.'
                : pet.status === 'transitada'
                  ? 'Asignada a la agrupación (visible para todos los administradores).'
                  : 'Esta mascota aún no está en tránsito.'}
            </p>
            {pet.transit_assigned_at && (
              <p className="text-xs text-teal-600 mt-1">Desde {new Date(pet.transit_assigned_at).toLocaleDateString()}</p>
            )}
          </div>

          <Section title={`Reportes agrupados (${group_members?.length || 0})`} icon={<Layers className="w-4 h-4" />}>
            {isGroupedMember ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-2">Este reporte pertenece a la ficha principal:</p>
                {group_members?.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-11 h-11 rounded-xl bg-white border border-brand-accent overflow-hidden shrink-0">
                      {petImageAt(m, 0) ? <img src={petImageAt(m, 0)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><PawPrint className="w-5 h-5" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-xs text-brand-primary block truncate">{m.name || 'Sin nombre'}</span>
                      <span className="text-[10px] text-gray-500 block truncate">{m.location}</span>
                    </div>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0", statusColors[m.status] || 'bg-gray-100 text-gray-500')}>
                      {statusLabels[m.status] || m.status}
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-teal-50 text-teal-700 font-bold shrink-0">Principal</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {!group_members || group_members.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sin reportes agrupados.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {group_members.map((m: any) => (
                      <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-11 h-11 rounded-xl bg-white border border-brand-accent overflow-hidden shrink-0">
                          {petImageAt(m, 0) ? <img src={petImageAt(m, 0)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><PawPrint className="w-5 h-5" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-xs text-brand-primary block truncate">{m.name || 'Sin nombre'}</span>
                          <span className="text-[10px] text-gray-500 block truncate">{m.location}</span>
                        </div>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0", statusColors[m.status] || 'bg-gray-100 text-gray-500')}>
                          {statusLabels[m.status] || m.status}
                        </span>
                        <button
                          onClick={async () => {
                            if (!confirm('¿Desagrupar este reporte?')) return;
                            try { await api.pets.ungroup(pet.id, m.id); refresh(); } catch (e: any) { alert(e?.message || 'Error'); }
                          }}
                          className="text-[10px] px-2 py-1 rounded-full bg-red-50 text-red-600 font-bold hover:bg-red-100 shrink-0"
                        >
                          Desagrupar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowModal('group')}
                  className="mt-3 w-full py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary/90 transition-colors"
                >
                  + Agrupar reporte
                </button>
              </>
            )}
          </Section>
        </div>
      )}

      {/* History tab */}
      {activeSubTab === 'history' && (
        <div className="space-y-3">
          {!history || history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin eventos registrados</p>
          ) : (
            <div className="relative pl-5 border-l-2 border-brand-accent space-y-4">
              {history.map((h: any) => (
                <div key={h.id} className="relative">
                  <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-brand-primary border-2 border-white" />
                  <div className="text-sm">
                    <span className="font-bold text-brand-primary">{historyEventLabel(h.event_type)}</span>
                    {h.to_status && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100 text-gray-600">
                        {statusLabels[h.from_status] || h.from_status || ''} → {statusLabels[h.to_status] || h.to_status}
                      </span>
                    )}
                  </div>
                  {h.description && <p className="text-xs text-gray-600 mt-0.5">{h.description}</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(h.created_at).toLocaleString()} {h.changed_by_name ? `· ${h.changed_by_name}` : ''}
                  </p>
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

      {showReunionModal && (
        <ReunionModal
          petId={pet.id}
          petName={pet.name || 'Mascota'}
          isAdoption={pet.status === 'for_adoption' || pet.status === 'for_adoption_simple'}
          skipStatusChange
          onClose={() => setShowReunionModal(false)}
          onSaved={() => setShowReunionModal(false)}
        />
      )}

      {showModal && (
        <AnimatePresence>
          <PetGroupTransitModal
            mode={showModal}
            petId={pet.id}
            pets={pets || []}
            users={users || []}
            onClose={() => setShowModal(null)}
            onSaved={refresh}
          />
        </AnimatePresence>
      )}
    </div>
  );
}
