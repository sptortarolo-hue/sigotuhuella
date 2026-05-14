import React, { useState, useEffect } from 'react';
import { getPets, createPet, updatePet, deletePet, Pet, PetStatus } from '@/src/lib/petService';
import { uploadMultiplePetImages } from '@/src/lib/storageService';
import { 
  getCollaborationAccounts, 
  createCollaborationAccount, 
  updateCollaborationAccount, 
  deleteCollaborationAccount,
  getVolunteerRequests,
  CollaborationAccount,
  VolunteerRequest
} from '@/src/lib/collaborationService';
import { useAuth } from '@/src/hooks/useAuth';
import PetCard from '@/src/components/PetCard';
import { 
  Plus, X, Loader2, Save, AlertCircle, Camera, 
  CreditCard, Users, LayoutDashboard, Trash2, 
  Edit2, ExternalLink, Calendar, MapPin, Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

export default function Admin() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pets' | 'collab' | 'volunteers'>('pets');
  
  // Pets State
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    species: 'dog' as 'dog' | 'cat' | 'other',
    breed: '',
    color: '',
    status: PetStatus.LOST,
    gender: 'unknown' as 'male' | 'female' | 'unknown',
    location: '',
    contactInfo: '',
    description: '',
    imageUrls: [] as string[]
  });

  // Collaboration State
  const [accounts, setAccounts] = useState<CollaborationAccount[]>([]);
  const [showCollabForm, setShowCollabForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CollaborationAccount | null>(null);
  const [collabData, setCollabData] = useState<Omit<CollaborationAccount, 'id'>>({
    title: '',
    description: '',
    bankName: '',
    alias: '',
    cbu: '',
    cvu: '',
    order: 0
  });

  // Volunteers State
  const [volunteers, setVolunteers] = useState<VolunteerRequest[]>([]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchPets(), fetchAccounts(), fetchVolunteers()]);
    setLoading(false);
  };

  const fetchPets = async () => {
    try {
      const data = await getPets();
      setPets(data);
    } catch (e) { console.error(e); }
  };

  const fetchAccounts = async () => {
    try {
      const data = await getCollaborationAccounts();
      setAccounts(data);
    } catch (e) { console.error(e); }
  };

  const fetchVolunteers = async () => {
    try {
      const data = await getVolunteerRequests();
      setVolunteers(data);
    } catch (e) { console.error(e); }
  };

  // Pet Handlers
  const handlePetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      let finalImageUrls = [...formData.imageUrls];
      if (selectedFiles.length > 0) {
        const uploadedUrls = await uploadMultiplePetImages(selectedFiles);
        finalImageUrls = [...finalImageUrls, ...uploadedUrls].slice(0, 3);
      }

      const dataToSave = { ...formData, imageUrls: finalImageUrls, imageUrl: finalImageUrls[0] || '' };

      if (editingPet) await updatePet(editingPet.id, dataToSave);
      else await createPet(dataToSave);
      
      setShowForm(false);
      resetPetForm();
      fetchPets();
    } catch (e) { console.error(e); alert('Error al guardar'); } 
    finally { setFormLoading(false); }
  };

  const resetPetForm = () => {
    setFormData({ name: '', species: 'dog', breed: '', color: '', status: PetStatus.LOST, gender: 'unknown', location: '', contactInfo: '', description: '', imageUrls: [] });
    setPreviews([]);
    setSelectedFiles([]);
    setEditingPet(null);
  };

  // Collab Handlers
  const handleCollabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingAccount) await updateCollaborationAccount(editingAccount.id, collabData);
      else await createCollaborationAccount(collabData);
      
      setShowCollabForm(false);
      setEditingAccount(null);
      setCollabData({ title: '', description: '', bankName: '', alias: '', cbu: '', cvu: '', order: accounts.length });
      fetchAccounts();
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { setFormLoading(false); }
  };

  const handleDeleteCollab = async (id: string) => {
    if (confirm('Eliminar cuenta de ayuda?')) {
      await deleteCollaborationAccount(id);
      fetchAccounts();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2">Panel de Administración</h1>
        <p className="text-gray-500">Gestión integral de reportes, ayuda y red de vecinos.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-4 mb-12 border-b border-brand-accent pb-px">
        {[
          { id: 'pets', label: 'Mascotas', icon: LayoutDashboard },
          { id: 'collab', label: 'Cuentas de Ayuda', icon: CreditCard },
          { id: 'volunteers', label: 'Solicitudes Sumate', icon: Users },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-4 font-bold transition-all relative",
              activeTab === tab.id ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {activeTab === 'pets' && (
            <>
              <div className="flex justify-end mb-6">
                <button
                  onClick={() => { resetPetForm(); setShowForm(true); }}
                  className="px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" /> Nuevo Reporte
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {pets.map(pet => (
                  <PetCard 
                    key={pet.id} pet={pet} showAdminActions 
                    onEdit={(p) => { 
                      setEditingPet(p); 
                      setFormData({ 
                        name: p.name || '',
                        species: p.species,
                        breed: p.breed || '',
                        color: p.color || '',
                        status: p.status,
                        gender: p.gender || 'unknown',
                        location: p.location || '',
                        contactInfo: p.contactInfo || '',
                        description: p.description || '',
                        imageUrls: p.imageUrls || [] 
                      }); 
                      setPreviews(p.imageUrls || []); 
                      setShowForm(true); 
                    }}
                    onDelete={async (id) => { if(confirm('Eliminar?')) { await deletePet(id); fetchPets(); } }} 
                  />
                ))}
              </div>
            </>
          )}

          {activeTab === 'collab' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <button
                  onClick={() => { setEditingAccount(null); setCollabData({ title: '', description: '', bankName: '', alias: '', cbu: '', cvu: '', order: accounts.length }); setShowCollabForm(true); }}
                  className="px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" /> Nueva Cuenta
                </button>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                      <th className="px-6 py-4">Título</th>
                      <th className="px-6 py-4">Banco</th>
                      <th className="px-6 py-4">Datos</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-accent">
                    {accounts.map(acc => (
                      <tr key={acc.id} className="hover:bg-brand-bg/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-brand-primary">{acc.title}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{acc.bankName}</td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {acc.alias && <div>Alias: {acc.alias}</div>}
                          {acc.cbu && <div>CBU: {acc.cbu}</div>}
                          {acc.cvu && <div>CVU: {acc.cvu}</div>}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => { setEditingAccount(acc); setCollabData(acc); setShowCollabForm(true); }} className="p-2 text-brand-primary hover:bg-brand-accent rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteCollab(acc.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'volunteers' && (
            <div className="grid gap-4">
              {volunteers.map(vol => (
                <div key={vol.id} className="bg-white p-6 rounded-3xl border border-brand-accent shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-brand-primary">{vol.fullName}</h3>
                      <span className="text-[10px] px-2 py-0.5 bg-brand-bg border border-brand-accent rounded-full font-bold uppercase text-gray-400">
                        {vol.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {vol.residenceZone}</div>
                      <div className="flex items-center gap-1"><Phone className="w-4 h-4" /> {vol.whatsapp}</div>
                      <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(vol.createdAt?.seconds * 1000).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <a 
                    href={`https://wa.me/${vol.whatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"
                  >
                    Contactar <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
              {volunteers.length === 0 && (
                <div className="text-center py-20 bg-brand-bg rounded-[2.5rem] border-2 border-dashed border-brand-accent">
                  <p className="text-gray-400 font-medium">Aún no hay solicitudes para sumarse.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Forms Modals */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <h2 className="text-2xl font-serif font-bold text-brand-primary">{editingPet ? 'Editar Reporte' : 'Nuevo Reporte'}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handlePetSubmit} className="p-8 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className="text-xs font-bold uppercase text-gray-500">Nombre</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                  <div><label className="text-xs font-bold uppercase text-gray-500">Especie</label><select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.species} onChange={e => setFormData({...formData, species: e.target.value as any})}><option value="dog">Perro</option><option value="cat">Gato</option></select></div>
                </div>
                <div><label className="text-xs font-bold uppercase text-gray-500">Estado</label><select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}><option value={PetStatus.LOST}>Perdido</option><option value={PetStatus.FOUND}>Encontrado</option><option value={PetStatus.FOR_ADOPTION}>Para Adopción</option></select></div>
                <div><label className="text-xs font-bold uppercase text-gray-500">Ubicación</label><input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} /></div>
                <div><label className="text-xs font-bold uppercase text-gray-500">Descripción</label><textarea required rows={3} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                <button type="submit" disabled={formLoading} className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold">{formLoading ? <Loader2 className="animate-spin" /> : <Save className="w-5 h-5 inline mr-2" />} Guardar</button>
              </form>
            </motion.div>
          </div>
        )}

        {showCollabForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCollabForm(false)} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <h2 className="text-2xl font-serif font-bold text-brand-primary">{editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
                <button onClick={() => setShowCollabForm(false)} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleCollabSubmit} className="p-8 space-y-4">
                <div><label className="text-xs font-bold uppercase text-gray-500">Título</label><input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.title} onChange={e => setCollabData({...collabData, title: e.target.value})} /></div>
                <div><label className="text-xs font-bold uppercase text-gray-500">Descripción</label><textarea rows={2} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.description} onChange={e => setCollabData({...collabData, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold uppercase text-gray-500">Banco</label><input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.bankName} onChange={e => setCollabData({...collabData, bankName: e.target.value})} /></div>
                  <div><label className="text-xs font-bold uppercase text-gray-500">Alias</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.alias} onChange={e => setCollabData({...collabData, alias: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold uppercase text-gray-500">CBU</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.cbu} onChange={e => setCollabData({...collabData, cbu: e.target.value})} /></div>
                  <div><label className="text-xs font-bold uppercase text-gray-500">CVU</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.cvu} onChange={e => setCollabData({...collabData, cvu: e.target.value})} /></div>
                </div>
                <button type="submit" disabled={formLoading} className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold">{formLoading ? <Loader2 className="animate-spin" /> : 'Guardar Datos'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
