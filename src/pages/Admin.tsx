import React, { useState, useEffect } from 'react';
import { getPets, createPet, updatePet, deletePet, Pet, PetStatus, getPetImageUrl } from '@/src/lib/petService';
import { filesToBase64, compressImage } from '@/src/lib/storageService';
import {
  getCollaborationAccounts,
  createCollaborationAccount,
  updateCollaborationAccount,
  deleteCollaborationAccount,
  getVolunteerRequests,
  updateVolunteerRequestStatus,
  deleteVolunteerRequest,
  CollaborationAccount,
  VolunteerRequest
} from '@/src/lib/collaborationService';
import { getNews, createNews, updateNews, deleteNews, News, getNewsImageUrl } from '@/src/lib/newsService';
import { useAuth } from '@/src/hooks/useAuth';
import { Badge } from '@/src/hooks/AuthProvider';
import { api } from '@/src/lib/api';
import PetCard from '@/src/components/PetCard';
import SocialShareModal from '@/src/components/SocialShareModal';
import { BADGE_CONFIG } from '@/src/components/MemberCard';
import VideoGeneratorTab from '@/src/pages/admin/VideoGeneratorTab';
import {
  Plus, X, Loader2, Save, AlertCircle, Camera, FileText, Download, Activity,
  CreditCard, Users, LayoutDashboard, Trash2,
  Edit2, ExternalLink, Calendar, MapPin, Phone, User, UserCog, Search, RefreshCw, HeartHandshake, Sparkles, Heart, Share2, PawPrint, Award, MessageSquare, FlaskConical, Map, Film, QrCode, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

export default function Admin() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pets' | 'adoption' | 'collab' | 'volunteers' | 'users' | 'highlights' | 'news' | 'whatsapp' | 'public' | 'videos' | 'qr'>('pets');

  // Pets State
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [petSearch, setPetSearch] = useState('');
  const [petStatusFilter, setPetStatusFilter] = useState<string>('all');
  const [previews, setPreviews] = useState<string[]>([]);
  const [imagesToKeep, setImagesToKeep] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    species: 'dog' as 'dog' | 'cat' | 'other',
    breed: '',
    color: '',
    status: PetStatus.LOST,
    gender: 'unknown' as 'male' | 'female' | 'unknown',
    age: '',
    size: 'medium' as 'small' | 'medium' | 'large',
    isVaccinated: false,
    isSterilized: false,
    isDewormed: false,
    location: '',
    contactInfo: '',
    description: '',
  });

  // Collaboration State
  const [accounts, setAccounts] = useState<CollaborationAccount[]>([]);
  const [showCollabForm, setShowCollabForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CollaborationAccount | null>(null);
  const [collabData, setCollabData] = useState({
    title: '',
    description: '',
    bankName: '',
    alias: '',
    cbu: '',
    cvu: '',
    displayOrder: 0,
    mercadopagoLink: '',
  });

  // Volunteers State
  const [volunteers, setVolunteers] = useState<VolunteerRequest[]>([]);
  const [memberInfo, setMemberInfo] = useState<Record<string, { member_number?: string; volunteer_status?: string; badges?: Badge[]; contribution_areas?: string[] }>>({});
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [volunteerBadgeFilter, setVolunteerBadgeFilter] = useState('');

  const MANUAL_BADGES = [
    { code: 'volunteer', label: 'Voluntario/a', icon: '🤝' },
    { code: 'first_donation', label: '1ra Donación', icon: '❤️' },
    { code: 'frequent_donor', label: 'Donante Frecuente', icon: '💜' },
    { code: 'foster_hero', label: 'Héroe Tránsito', icon: '🏠' },
    { code: 'rescuer', label: 'Rescatista', icon: '🛡️' },
    { code: 'founder', label: 'Fundador/a', icon: '👑' },
    { code: 'ayuda_traslados', label: 'Ayuda en traslados', icon: '🚗' },
    { code: 'hogares_transito', label: 'Hogares de tránsito', icon: '🏠' },
    { code: 'difusion_redes', label: 'Difusión en redes', icon: '📱' },
    { code: 'logistica', label: 'Logística y org.', icon: '📋' },
    { code: 'aporte_economico', label: 'Aporte económico', icon: '💰' },
    { code: 'fotografia_video', label: 'Fotografía y video', icon: '📸' },
    { code: 'recoleccion_insumos', label: 'Recolección insumos', icon: '📦' },
    { code: 'apoyo_veterinario', label: 'Apoyo veterinario', icon: '🩺' },
    { code: 'asesoria_legal', label: 'Asesoría legal', icon: '⚖️' },
    { code: 'diseno_grafico', label: 'Diseño gráfico', icon: '🎨' },
  ];
  const ALL_BADGES = MANUAL_BADGES;
  const AUTO_BADGE_CODES = new Set(Object.keys(BADGE_CONFIG).filter(k => !MANUAL_BADGES.some(m => m.code === k)));

  // Users State
  const [userList, setUserList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // News State
  const [newsList, setNewsList] = useState<News[]>([]);
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [newsFormLoading, setNewsFormLoading] = useState(false);
  const [newsFormData, setNewsFormData] = useState({
    title: '',
    content: '',
    videoUrl: '',
  });
  const [newsFile, setNewsFile] = useState<File | null>(null);
  const [newsPreview, setNewsPreview] = useState<string | null>(null);
  const [newsImageData, setNewsImageData] = useState<string | null>(null);
  const [newsMimeType, setNewsMimeType] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiType, setAiType] = useState('consejo_cuidado');
  const [aiTopic, setAiTopic] = useState('');

  // WhatsApp Settings state
  const [whatsappSettings, setWhatsappSettings] = useState<Record<string, string>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [waMessages, setWaMessages] = useState<any[]>([]);
  const [waMessagesLoading, setWaMessagesLoading] = useState(false);

  // QR State
  const [qrUnassigned, setQrUnassigned] = useState<any[]>([]);
  const [qrRequests, setQrRequests] = useState<any[]>([]);
  const [qrBatchCount, setQrBatchCount] = useState(12);
  const [qrBatchLoading, setQrBatchLoading] = useState(false);
  const [qrAssignLoading, setQrAssignLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchPets(), fetchAccounts(), fetchVolunteers(), fetchUsers(), fetchNews(), fetchSettings(), fetchQrData()]);
    setLoading(false);
  };

  const fetchSettings = async () => {
    try {
      const data = await api.settings.list();
      const map: Record<string, string> = {};
      data.forEach((s: any) => { map[s.key] = s.value; });
      setWhatsappSettings(map);
    } catch (e) { console.error(e); }
  };

  const fetchQrData = async () => {
    try {
      const [unassigned, requests] = await Promise.all([
        api.qr.unassigned(),
        api.qr.requests(),
      ]);
      setQrUnassigned(unassigned.identifiers || []);
      setQrRequests(requests.requests || []);
    } catch (e) { console.error(e); }
  };

  const handleQrBatch = async () => {
    try {
      setQrBatchLoading(true);
      await api.qr.batch(qrBatchCount);
      await fetchQrData();
    } catch (e: any) {
      alert(e.message || 'Error al generar QRs');
    } finally {
      setQrBatchLoading(false);
    }
  };

  const handleQrAssign = async (qrId: string, myPetId: string) => {
    try {
      setQrAssignLoading(myPetId);
      await api.qr.assign(qrId, myPetId);
      await fetchQrData();
    } catch (e: any) {
      alert(e.message || 'Error al asignar QR');
    } finally {
      setQrAssignLoading(null);
    }
  };

  const handleQrPdf = async (batchId: string) => {
    try {
      await api.qr.batchPdf(batchId);
    } catch (e: any) {
      alert(e.message || 'Error al descargar PDF');
    }
  };

  const fetchWaMessages = async () => {
    setWaMessagesLoading(true);
    try {
      const data = await api.whatsapp.messages();
      setWaMessages(data);
    } catch (e) { console.error(e); }
    setWaMessagesLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'whatsapp') fetchWaMessages();
    if (activeTab === 'volunteers') fetchVolunteers();
  }, [activeTab]);

  const fetchNews = async () => {
    try {
      const data = await getNews();
      setNewsList(data);
    } catch (e) { console.error(e); }
  };

  const resetNewsForm = () => {
    setNewsFormData({ title: '', content: '', videoUrl: '' });
    setNewsFile(null);
    setNewsPreview(null);
    setNewsImageData(null);
    setNewsMimeType(null);
    setAiType('consejo_cuidado');
    setAiTopic('');
    setEditingNews(null);
  };

  const editNews = (item: News) => {
    setEditingNews(item);
    setNewsFormData({ title: item.title, content: item.content, videoUrl: item.video_url || '' });
    const url = getNewsImageUrl(item);
    setNewsPreview(url);
    setNewsImageData(item.image_data);
    setNewsMimeType(item.mime_type);
    setShowNewsForm(true);
  };

  const handleNewsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setNewsFile(compressed);
      setNewsPreview(URL.createObjectURL(compressed));
      const results = await filesToBase64([compressed]);
      setNewsImageData(results[0]?.data || null);
      setNewsMimeType(results[0]?.mimeType || null);
    } catch (err) {
      console.error('Error al procesar imagen:', err);
      alert('No se pudo procesar la imagen. Intentá con otra.');
      e.target.value = '';
    }
  };

  const handleAiGenerate = async () => {
    setAiGenerating(true);
    try {
      const result = await api.ai.generateNews({ type: aiType, topic: aiTopic });
      setNewsFormData(prev => ({ ...prev, title: result.title, content: result.content }));
      if (result.coverImage && result.coverMimeType) {
        setNewsImageData(result.coverImage);
        setNewsMimeType(result.coverMimeType);
        setNewsPreview(`data:${result.coverMimeType};base64,${result.coverImage}`);
      }
    } catch (e: any) {
      alert(e.message || 'Error al generar contenido con IA');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleNewsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsFormLoading(true);
    try {
      const payload: any = {
        title: newsFormData.title,
        content: newsFormData.content,
        videoUrl: newsFormData.videoUrl || null,
      };
      if (newsImageData && newsMimeType) {
        payload.imageData = newsImageData;
        payload.mimeType = newsMimeType;
      }
      if (editingNews) await updateNews(editingNews.id, payload);
      else await createNews(payload);

      setShowNewsForm(false);
      resetNewsForm();
      fetchNews();
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { setNewsFormLoading(false); }
  };

  const handleDeleteNews = async (id: string) => {
    if (!confirm('¿Eliminar esta novedad definitivamente?')) return;
    try {
      await deleteNews(id);
      fetchNews();
    } catch (e) { console.error(e); alert('Error al eliminar'); }
  };

  const loadPetRecords = async (petId: string) => {
    try {
      const [recordsData, summaryData] = await Promise.all([
        api.pets.records.list(petId),
        api.pets.records.summary(petId),
      ]);
      setPetRecords(recordsData.records || []);
      setRecordsSummary(summaryData.summary || null);
    } catch (e) { console.error(e); }
  };

  const handleTrackPet = (pet: Pet) => {
    setTrackPet(pet);
    setShowRecordForm(false);
    loadPetRecords(pet.id);
  };

  const resetRecordForm = () => {
    setRecordFormData({
      recordType: 'appointment', title: '', description: '', amount: '',
      recordDate: new Date().toISOString().split('T')[0], nextDate: '',
      vetName: '', clinicName: '', medicationName: '', dosage: '',
    });
    setRecordFile(null); setRecordFileName('');
  };

  const handleRecordFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setRecordFile(file); setRecordFileName(file.name); }
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecordFormLoading(true);
    try {
      let attachmentData = null; let attachmentType = null;
      if (recordFile) {
        const reader = new FileReader();
        attachmentData = await new Promise((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(recordFile);
        });
        attachmentType = recordFile.type;
      }
      await api.pets.records.create(trackPet!.id, {
        recordType: recordFormData.recordType,
        title: recordFormData.title,
        description: recordFormData.description || null,
        amount: recordFormData.amount ? parseFloat(recordFormData.amount) : null,
        recordDate: recordFormData.recordDate,
        nextDate: recordFormData.nextDate || null,
        vetName: recordFormData.vetName || null,
        clinicName: recordFormData.clinicName || null,
        medicationName: recordFormData.medicationName || null,
        dosage: recordFormData.dosage || null,
        attachmentData, attachmentType, attachmentName: recordFileName || null,
      });
      setShowRecordForm(false);
      resetRecordForm();
      loadPetRecords(trackPet!.id);
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { setRecordFormLoading(false); }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try { await api.pets.records.delete(trackPet!.id, recordId); loadPetRecords(trackPet!.id); }
    catch (e) { console.error(e); alert('Error al eliminar'); }
  };

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState('seguimiento.pdf');

  const handlePreviewPdf = async (petId: string) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/pets/${petId}/records/report`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || 'Error al generar PDF'); return; }
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?(.+?)"?$/);
      setPdfFilename(match ? match[1] : 'seguimiento.pdf');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
    } catch (e) { console.error(e); alert('Error al generar PDF'); }
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
      console.log('volunteers data:', data);
      setVolunteers(data);
      const userIds = data.filter((v: VolunteerRequest) => v.user_id).map((v: VolunteerRequest) => v.user_id);
      if (userIds.length > 0) {
        const usersData = await api.users.list();
        const infoMap: Record<string, any> = {};
        (usersData.users || []).forEach((u: any) => {
          if (userIds.includes(u.id)) {
            infoMap[u.id] = { member_number: u.member_number, volunteer_status: u.volunteer_status, badges: u.badges || [], contribution_areas: u.contribution_areas || [], avatar_data: u.avatar_data, avatar_mime_type: u.avatar_mime_type, avatar_type: u.avatar_type };
          }
        });
        setMemberInfo(infoMap);
      }
    } catch (e) { console.error(e); }
  };

  const fetchUsers = async () => {
    try {
      const data = await api.users.list();
      setUserList(data.users || []);
    } catch (e) { console.error(e); }
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm('¿Eliminar este usuario definitivamente?')) {
      await api.users.delete(id);
      fetchUsers();
    }
  };

  const handleToggleRole = async (id: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await api.users.update(id, { role: newRole });
    fetchUsers();
  };

  // Reencuentro handler
  const handleReencuentro = async (petId: string) => {
    if (!confirm('¿Marcar esta mascota como "Hubo reencuentro"? Se moverá a Noticias Destacadas.')) return;
    try {
      await updatePet(petId, { status: PetStatus.REUNITED });
      fetchPets();
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el estado.');
    }
  };

  // Pet Handlers
  const handlePetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const dataToSave: any = {
        name: formData.name || null,
        species: formData.species,
        breed: formData.breed || null,
        color: formData.color || null,
        status: formData.status,
        gender: formData.gender,
        age: formData.age || null,
        size: formData.size || null,
        isVaccinated: formData.isVaccinated,
        isSterilized: formData.isSterilized,
        isDewormed: formData.isDewormed,
        location: formData.location,
        contactInfo: formData.contactInfo,
        description: formData.description,
      };

      if (editingPet) {
        const newImages = selectedFiles.length > 0 ? await filesToBase64(selectedFiles) : [];
        await updatePet(editingPet.id, {
          ...dataToSave,
          imagesToKeep,
          newImages,
        } as any);
      } else {
        let images: { data: string; mimeType: string }[] = [];
        if (selectedFiles.length > 0) {
          images = await filesToBase64(selectedFiles);
        }
        await createPet({ ...dataToSave, images } as any);
      }

      setShowForm(false);
      resetPetForm();
      fetchPets();
    } catch (e: any) { console.error(e); alert('Error: ' + (e.message || 'Error al guardar')); }
    finally { setFormLoading(false); }
  };

  const resetPetForm = () => {
    setFormData({ name: '', species: 'dog', breed: '', color: '', status: PetStatus.LOST, gender: 'unknown', age: '', size: 'medium', isVaccinated: false, isSterilized: false, isDewormed: false, location: '', contactInfo: '', description: '' });
    setPreviews([]);
    setSelectedFiles([]);
    setEditingPet(null);
    setImagesToKeep([]);
  };

  const editPet = async (pet: Pet) => {
    setEditingPet(pet);
    setFormData({
      name: pet.name || '',
      species: pet.species as any,
      breed: pet.breed || '',
      color: pet.color || '',
      status: pet.status,
      gender: pet.gender || 'unknown',
      age: pet.age || '',
      size: pet.size || 'medium',
      isVaccinated: pet.is_vaccinated || false,
      isSterilized: pet.is_sterilized || false,
      isDewormed: pet.is_dewormed || false,
      location: pet.location || '',
      contactInfo: pet.contact_info || '',
      description: pet.description || '',
    });
    setSelectedFiles([]);
    setImagesToKeep(pet.images?.map(img => img.id) || []);
    setPreviews(pet.images?.map(img => `data:${img.mime_type};base64,${img.image_data}`) || []);
    setShowForm(true);
  };

  // Collab Handlers
  const handleCollabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingAccount) {
        await updateCollaborationAccount(editingAccount.id, collabData);
      } else {
        await createCollaborationAccount(collabData);
      }
      setShowCollabForm(false);
      setEditingAccount(null);
      setCollabData({ title: '', description: '', bankName: '', alias: '', cbu: '', cvu: '', displayOrder: accounts.length, mercadopagoLink: '' });
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

  const handleVolunteerStatus = async (id: string, status: string) => {
    await updateVolunteerRequestStatus(id, status);
    fetchVolunteers();
    if (status === 'accepted') fetchUsers();
  };

  const handleDeleteVolunteer = async (id: string) => {
    if (!confirm('¿Eliminar esta solicitud definitivamente?')) return;
    try {
      await deleteVolunteerRequest(id);
      fetchVolunteers();
    } catch (e) { console.error(e); alert('Error al eliminar'); }
  };

  const handleAwardBadge = async (userId: string, code: string) => {
    const info = memberInfo[userId];
    const existing = info?.badges || [];
    if (existing.find((b: Badge) => b.code === code)) return;
    const updated = [...existing, { code, awarded_at: new Date().toISOString() }];
    await api.users.update(userId, { badges: JSON.stringify(updated) });
    fetchVolunteers();
    fetchUsers();
  };

  const handleRemoveBadge = async (userId: string, code: string) => {
    const info = memberInfo[userId];
    const updated = (info?.badges || []).filter((b: Badge) => b.code !== code);
    await api.users.update(userId, { badges: JSON.stringify(updated) });
    fetchVolunteers();
    fetchUsers();
  };

  // Datos para Noticias Destacadas
  const highlightedPets = pets.filter(p => p.status === PetStatus.REUNITED);
  const [sharePet, setSharePet] = useState<Pet | null>(null);
  const [trackPet, setTrackPet] = useState<Pet | null>(null);
  const [petRecords, setPetRecords] = useState<any[]>([]);
  const [recordsSummary, setRecordsSummary] = useState<any>(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordFormLoading, setRecordFormLoading] = useState(false);
  const [recordFormData, setRecordFormData] = useState({
    recordType: 'appointment', title: '', description: '', amount: '', recordDate: new Date().toISOString().split('T')[0],
    nextDate: '', vetName: '', clinicName: '', medicationName: '', dosage: '',
  });
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [recordFileName, setRecordFileName] = useState('');

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
          { id: 'adoption', label: 'Adopción', icon: Heart },
          { id: 'collab', label: 'Cuentas de Ayuda', icon: CreditCard },
                      { id: 'volunteers', label: 'Solicitudes Sumate', icon: Heart },
          { id: 'users', label: 'Usuarios', icon: UserCog },
          { id: 'highlights', label: 'Noticias Destacadas', icon: HeartHandshake },
          { id: 'news', label: 'Novedades', icon: Sparkles },
          { id: 'public', label: 'Reportes Públicos', icon: FileText },
          { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
          { id: 'videos', label: 'Videos', icon: Film },
  { id: 'qr', label: 'QR', icon: QrCode },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-3 md:px-6 py-2 md:py-4 font-bold transition-all relative",
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
          {/* ====== MASCOTAS ====== */}
          {activeTab === 'pets' && (
            <>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, ubicación, especie, contacto..."
                    value={petSearch}
                    onChange={e => setPetSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none shadow-sm"
                  />
                </div>
                <select
                  value={petStatusFilter}
                  onChange={e => setPetStatusFilter(e.target.value)}
                  className="px-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none shadow-sm text-sm"
                >
                  <option value="all">Todos los estados</option>
                  <option value={PetStatus.LOST}>Perdido</option>
                  <option value={PetStatus.RETAINED}>Retenido</option>
                  <option value={PetStatus.SIGHTED}>Avistado</option>
                  <option value={PetStatus.ACCIDENTED}>Accidentado</option>
                  <option value={PetStatus.NEEDS_ATTENTION}>Necesita Atención</option>
                  <option value={PetStatus.FOR_ADOPTION}>Para Adopción</option>
                  <option value={PetStatus.ADOPTED}>Adoptado</option>
                  <option value={PetStatus.REUNITED}>Reencuentro</option>
                </select>
                <button
                  onClick={() => { resetPetForm(); setShowForm(true); }}
                  className="px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-lg transition-all shrink-0"
                >
                  <Plus className="w-5 h-5" /> Nuevo Reporte
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {pets.filter(p => {
                  if (petStatusFilter !== 'all' && p.status !== petStatusFilter) return false;
                  if (!petSearch.trim()) return true;
                  const q = petSearch.toLowerCase();
                  return (
                    (p.name && p.name.toLowerCase().includes(q)) ||
                    (p.location && p.location.toLowerCase().includes(q)) ||
                    (p.description && p.description.toLowerCase().includes(q)) ||
                    (p.contact_info && p.contact_info.toLowerCase().includes(q)) ||
                    (p.species && p.species.toLowerCase().includes(q)) ||
                    (p.breed && p.breed.toLowerCase().includes(q)) ||
                    (p.color && p.color.toLowerCase().includes(q))
                  );
                }).map(pet => (
                  <div key={pet.id} className="relative">
                    <PetCard
                      pet={pet}
                      showAdminActions
                      onEdit={editPet}
                      onDelete={async (id) => { if (confirm('Eliminar?')) { await deletePet(id); fetchPets(); } }}
                    />
                    {/* Botón Acción de Estado */}
                    {pet.status === PetStatus.FOR_ADOPTION ? (
                      <button
                        onClick={async () => {
                          if (confirm('¿Marcar esta mascota como adoptada?')) {
                            try {
                              await updatePet(pet.id, { status: PetStatus.ADOPTED });
                              fetchPets();
                            } catch (e) {
                              console.error(e);
                              alert('Error al actualizar el estado.');
                            }
                          }
                        }}
                        className="mt-3 w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors"
                      >
                        <Heart className="w-4 h-4" />
                        Marcar como Adoptado
                      </button>
                    ) : pet.status === PetStatus.ADOPTED ? (
                      <div className="mt-3 w-full py-2.5 bg-gray-100 text-gray-500 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-gray-200">
                        <Heart className="w-4 h-4 text-emerald-500" />
                        Adoptado
                      </div>
                    ) : pet.status === PetStatus.REUNITED ? (
                      <div className="mt-3 w-full py-2.5 bg-gray-100 text-gray-500 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-gray-200">
                        <HeartHandshake className="w-4 h-4 text-emerald-500" />
                        Reencontrado
                      </div>
                    ) : (
                      <button
                        onClick={() => handleReencuentro(pet.id)}
                        className="mt-3 w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors"
                      >
                        <HeartHandshake className="w-4 h-4" />
                        Hubo reencuentro
                      </button>
                    )}
                    {/* Botón Redes Sociales */}
                    <button
                      onClick={() => setSharePet(pet)}
                      className="mt-2 w-full py-2.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all"
                    >
                      <Share2 className="w-4 h-4" />
                      Redes Sociales
                    </button>
                    {/* Botón Seguimiento */}
                    <button
                      onClick={() => handleTrackPet(pet)}
                      className="mt-2 w-full py-2.5 bg-brand-bg text-brand-primary border border-brand-accent rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-primary hover:text-white hover:border-brand-primary transition-all"
                    >
                      <Activity className="w-4 h-4" />
                      Seguimiento
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ====== ADOPCIÓN ====== */}
          {activeTab === 'adoption' && (
            <>
              <div className="flex justify-end mb-6">
                <button
                  onClick={() => { resetPetForm(); setFormData(prev => ({ ...prev, status: PetStatus.FOR_ADOPTION })); setShowForm(true); }}
                  className="px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" /> Nueva Publicación
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {pets.filter(p => p.status === PetStatus.FOR_ADOPTION || p.status === PetStatus.ADOPTED).map(pet => (
                  <div key={pet.id} className="relative">
                    <PetCard
                      pet={pet}
                      showAdminActions
                      onEdit={editPet}
                      onDelete={async (id) => { if (confirm('Eliminar?')) { await deletePet(id); fetchPets(); } }}
                    />
                    {pet.status === PetStatus.FOR_ADOPTION && (
                      <button
                        onClick={async () => {
                          if (confirm('¿Marcar como adoptado?')) {
                            await updatePet(pet.id, { status: PetStatus.ADOPTED });
                            fetchPets();
                          }
                        }}
                        className="mt-3 w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors"
                      >
                        Marcar como Adoptado
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ====== NOTICIAS DESTACADAS ====== */}
          {activeTab === 'highlights' && (
            <>
              <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-x-auto">
                <table className="w-full text-left min-w-max">
                  <thead>
                    <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                      <th className="px-6 py-4">Nombre</th>
                      <th className="px-6 py-4">Ubicación</th>
                      <th className="px-6 py-4">Contacto</th>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-accent">
                    {highlightedPets.map(pet => (
                      <tr key={pet.id} className="hover:bg-brand-bg/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-brand-primary">{pet.name || 'Sin nombre'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{pet.location}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{pet.contact_info || '-'}</td>
                        <td className="px-6 py-4 text-xs text-gray-400">{new Date(pet.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => { editPet(pet); setActiveTab('pets' as any); }}
                            className="p-2 text-brand-primary hover:bg-brand-accent rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {highlightedPets.length === 0 && (
                  <div className="text-center py-20 bg-brand-bg rounded-[2.5rem] border-2 border-dashed border-brand-accent">
                    <p className="text-gray-400 font-medium">No hay noticias destacadas aún. Marca mascotas como "Hubo reencuentro" desde la pestaña Mascotas.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ====== NOVEDADES ====== */}
          {activeTab === 'news' && (
            <>
              <div className="flex justify-end mb-6">
                <button
                  onClick={() => { resetNewsForm(); setShowNewsForm(true); }}
                  className="px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" /> Nueva Novedad
                </button>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-x-auto">
                <table className="w-full text-left min-w-max">
                  <thead>
                    <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                      <th className="px-6 py-4">Título</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-accent">
                    {newsList.map(item => (
                      <tr key={item.id} className="hover:bg-brand-bg/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-brand-primary max-w-[200px] min-w-[120px]">{item.title}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[10px] px-2 py-1 rounded-full font-bold uppercase",
                            item.type === 'manual' ? "bg-amber-100 text-amber-700" :
                            item.type === 'reunited' ? "bg-emerald-100 text-emerald-700" : "bg-brand-secondary/10 text-brand-secondary"
                          )}>
                            {item.type === 'manual' ? 'Manual' : item.type === 'reunited' ? 'Reencuentro' : 'Adopción'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {item.type === 'manual' && (
                            <button onClick={() => editNews(item)} className="p-2 text-brand-primary hover:bg-brand-accent rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          )}
                          <button onClick={() => handleDeleteNews(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {newsList.length === 0 && (
                  <div className="text-center py-20 bg-brand-bg rounded-[2.5rem] border-2 border-dashed border-brand-accent">
                    <p className="text-gray-400 font-medium">No hay novedades aún.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ====== CUENTAS DE AYUDA ====== */}
          {activeTab === 'collab' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <button
                  onClick={() => { setEditingAccount(null); setCollabData({ title: '', description: '', bankName: '', alias: '', cbu: '', cvu: '', displayOrder: accounts.length, mercadopagoLink: '' }); setShowCollabForm(true); }}
                  className="px-6 py-3 bg-brand-primary text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" /> Nueva Cuenta
                </button>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-x-auto">
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
                        <td className="px-6 py-4 text-sm text-gray-600">{acc.bank_name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {acc.alias && <div>Alias: {acc.alias}</div>}
                          {acc.cbu && <div>CBU: {acc.cbu}</div>}
                          {acc.cvu && <div>CVU: {acc.cvu}</div>}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => { setEditingAccount(acc); setCollabData({ title: acc.title, description: acc.description || '', bankName: acc.bank_name, alias: acc.alias || '', cbu: acc.cbu || '', cvu: acc.cvu || '', displayOrder: acc.display_order, mercadopagoLink: acc.mercadopago_link || '' }); setShowCollabForm(true); }} className="p-2 text-brand-primary hover:bg-brand-accent rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteCollab(acc.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ====== USUARIOS ====== */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="relative max-w-md w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por email, nombre o teléfono..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none shadow-sm"
                />
              </div>
              <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-x-auto">
                <table className="w-full text-left min-w-max">
                  <thead>
                    <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Nombre</th>
                      <th className="px-6 py-4">Teléfono</th>
                      <th className="px-6 py-4">Rol</th>
                      <th className="px-6 py-4">Miembro</th>
                      <th className="px-6 py-4">Registro</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-accent">
                    {userList
                      .filter(
                        u =>
                          !userSearch ||
                          (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
                          (u.display_name && u.display_name.toLowerCase().includes(userSearch.toLowerCase())) ||
                          (u.phone && u.phone.toLowerCase().includes(userSearch.toLowerCase()))
                      )
                      .map(u => (
                        <tr key={u.id} className="hover:bg-brand-bg/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-brand-primary">{u.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{u.display_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{u.phone || '-'}</td>
                          <td className="px-6 py-4">
                            <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold uppercase", u.role === 'admin' ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-gray-500")}>{u.role}</span>
                          </td>
                          <td className="px-6 py-4">
                            {u.member_number ? (
                              <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">{u.member_number}</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-right space-x-2">
                            {u.email !== 'sptortarolo@gmail.com' && (
                              <>
                                <button onClick={() => handleToggleRole(u.id, u.role)} className="p-2 text-brand-primary hover:bg-brand-accent rounded-lg transition-colors" title="Cambiar rol"><UserCog className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {userList.filter(
                  u =>
                    !userSearch ||
                    (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
                    (u.display_name && u.display_name.toLowerCase().includes(userSearch.toLowerCase())) ||
                    (u.phone && u.phone.toLowerCase().includes(userSearch.toLowerCase()))
                ).length === 0 && (
                  <div className="text-center py-20 bg-brand-bg rounded-[2.5rem] border-2 border-dashed border-brand-accent">
                    <p className="text-gray-400 font-medium">No hay usuarios que coincidan con la búsqueda.</p>
                  </div>
                )}
              </div>
            </div>
          )}

            {/* ====== VOLUNTARIOS ====== */}
            {activeTab === 'volunteers' && (
              <div className="space-y-10">
                {/* Search + Badge Filter */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, zona o WhatsApp..."
                      value={volunteerSearch}
                      onChange={e => setVolunteerSearch(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none shadow-sm"
                    />
                  </div>
                  <select
                    value={volunteerBadgeFilter}
                    onChange={e => setVolunteerBadgeFilter(e.target.value)}
                    className="px-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none shadow-sm text-sm"
                  >
                    <option value="">Todas las insignias</option>
                    {Object.entries(BADGE_CONFIG).map(([code, cfg]) => (
                      <option key={code} value={code}>{cfg.icon} {cfg.label}</option>
                    ))}
                  </select>
                </div>

                {/* filter helper */}
                {(() => {
                  const filterVolunteer = (v: VolunteerRequest) => {
                    const q = volunteerSearch.toLowerCase();
                    if (q && !v.full_name.toLowerCase().includes(q) && !v.residence_zone.toLowerCase().includes(q) && !v.whatsapp.toLowerCase().includes(q)) return false;
                    if (volunteerBadgeFilter) {
                      const info = v.user_id ? memberInfo[v.user_id] : null;
                      const badges = info?.badges || [];
                      if (!badges.some((b: Badge) => b.code === volunteerBadgeFilter)) return false;
                    }
                    return true;
                  };

                  const allFiltered = volunteers.filter(filterVolunteer);
                  const pending = allFiltered.filter(v => v.status === 'pending');
                  const active = allFiltered.filter(v => v.status === 'accepted' || v.status === 'suspended');

                  if (allFiltered.length === 0) {
                    return (
                      <div className="text-center py-20 bg-brand-bg rounded-[2.5rem] border-2 border-dashed border-brand-accent">
                        <p className="text-gray-400 font-medium">Aún no hay solicitudes para sumarse.</p>
                      </div>
                    );
                  }
                 return (
                   <>
                     <h2 className="text-xl font-serif font-bold text-brand-primary mb-4">Nuevas Solicitudes</h2>
                     <div className="grid gap-4">
                       {pending.map(vol => {
                         const info = vol.user_id ? memberInfo[vol.user_id] : null;
                         const badges = info?.badges || [];
                         return (
                           <div key={vol.id} className="bg-white p-6 rounded-3xl border border-brand-accent shadow-sm">
                             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                               <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    {info?.avatar_type === 'photo' && info?.avatar_data ? (
                                      <img
                                        src={`data:${info.avatar_mime_type || 'image/jpeg'};base64,${info.avatar_data}`}
                                        alt="Avatar"
                                        className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-brand-accent"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 border-2 border-brand-accent">
                                        <User className="w-5 h-5 text-brand-primary" />
                                      </div>
                                    )}
                                    <h3 className="font-bold text-lg text-brand-primary">{vol.full_name}</h3>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 text-gray-500`}>
                                      {vol.status === 'pending' ? 'Pendiente' : vol.status}
                                    </span>
                                 </div>
                                 <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                   <div className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {vol.residence_zone}</div>
                                   <div className="flex items-center gap-1"><Phone className="w-4 h-4" /> {vol.whatsapp}</div>
                                   <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(vol.created_at).toLocaleDateString()}</div>
                                 </div>
                                 {info?.member_number && (
                                   <div className="flex items-center gap-2 text-xs text-brand-primary font-bold mt-1">
                                     <PawPrint className="w-3 h-3" /> {info.member_number}
                                   </div>
                                 )}
                                 {badges.length > 0 && (
                                   <div className="flex flex-wrap gap-1.5 mt-2">
                                     {badges.map((b: Badge, i: number) => {
                                       const bc = ALL_BADGES.find(a => a.code === b.code);
                                       return bc ? (
                                         <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full text-[10px] font-bold">
                                           {bc.icon} {bc.label}
                                         </span>
                                       ) : null;
                                     })}
                                   </div>
                                 )}
                               </div>
                               <div className="flex gap-2">
                                 {vol.status !== 'accepted' && vol.status !== 'suspended' && (
                                   <button onClick={() => handleVolunteerStatus(vol.id, 'accepted')} className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors">Aceptar</button>
                                 )}
                                 <a
                                   href={`https://wa.me/${vol.whatsapp.replace(/\D/g, '')}`}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"
                                 >
                                   Contactar <ExternalLink className="w-4 h-4" />
                                 </a>
                               </div>
                             </div>
                           </div>
                         );
                        })}
                      </div>

                      {/* Socios Activos */}
                      {active.length > 0 && (
                      <>
                        <h2 className="text-xl font-serif font-bold text-brand-primary mb-4">Socios Activos</h2>
                        <div className="grid gap-4">
                          {active.map(vol => {
                            const info = vol.user_id ? memberInfo[vol.user_id] : null;
                            const badges = info?.badges || [];
                            return (
                              <div key={vol.id} className="bg-white p-6 rounded-3xl border border-brand-accent shadow-sm">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                  <div className="space-y-1">
                                   <div className="flex items-center gap-2">
                                       {info?.avatar_type === 'photo' && info?.avatar_data ? (
                                         <img
                                           src={`data:${info.avatar_mime_type || 'image/jpeg'};base64,${info.avatar_data}`}
                                           alt="Avatar"
                                           className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-brand-accent"
                                         />
                                       ) : (
                                         <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 border-2 border-brand-accent">
                                           <User className="w-5 h-5 text-brand-primary" />
                                         </div>
                                       )}
                                       <h3 className="font-bold text-lg text-brand-primary">{vol.full_name}</h3>
                                       <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                         vol.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                         vol.status === 'suspended' ? 'bg-red-100 text-red-600' :
                                         'bg-gray-100 text-gray-500'
                                       }`}>
                                         {vol.status === 'suspended' ? 'Suspendido' : vol.status}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                      <div className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {vol.residence_zone}</div>
                                      <div className="flex items-center gap-1"><Phone className="w-4 h-4" /> {vol.whatsapp}</div>
                                      <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(vol.created_at).toLocaleDateString()}</div>
                                    </div>
                                     {info?.member_number && (
                                       <div className="flex items-center gap-2 text-xs text-brand-primary font-bold mt-1">
                                         <PawPrint className="w-3 h-3" /> {info.member_number}
                                       </div>
                                     )}
                                     {info?.contribution_areas && info.contribution_areas.length > 0 && (
                                       <div className="flex flex-wrap gap-1.5 mt-2">
                                         {info.contribution_areas.map((area: string, i: number) => {
                                           const cfg = BADGE_CONFIG[area];
                                           return cfg ? (
                                             <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: cfg.color }}>
                                               {cfg.icon} {cfg.label}
                                             </span>
                                           ) : null;
                                         })}
                                       </div>
                                     )}
                                     {/* Auto-badges: read-only */}
                                     {(() => {
                                       const autoBadges = badges.filter((b) => AUTO_BADGE_CODES.has(b.code));
                                       if (autoBadges.length === 0) return null;
                                       return (
                                         <div className="mt-2">
                                           <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Insignias automáticas</p>
                                           <div className="flex flex-wrap gap-1.5">
                                             {autoBadges.map((b, i) => {
                                               const cfg = BADGE_CONFIG[b.code];
                                               return (
                                                 <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                                                   {cfg?.icon} {cfg?.label}
                                                 </span>
                                               );
                                             })}
                                           </div>
                                         </div>
                                       );
                                     })()}
                                     {/* Manual badges: clickable */}
                                     <div className="mt-2">
                                       <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Insignias manuales</p>
                                       <div className="flex flex-wrap gap-1.5">
                                         {MANUAL_BADGES.map((badge, idx) => {
                                           const hasBadge = badges.some((b) => b.code === badge.code);
                                           return (
                                             <span
                                               key={idx}
                                               onClick={() => {
                                                 if (hasBadge) { handleRemoveBadge(vol.user_id, badge.code); }
                                                 else if (vol.user_id) { handleAwardBadge(vol.user_id, badge.code); }
                                               }}
                                               title={hasBadge ? 'Clic para quitar' : 'Clic para asignar'}
                                               className={`cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${hasBadge ? 'bg-brand-primary/20 text-brand-primary' : 'border border-dashed border-brand-primary/30 text-gray-400 hover:text-brand-primary hover:border-brand-primary'}`}
                                             >
                                               {badge.icon} {badge.label}
                                             </span>
                                           );
                                         })}
                                       </div>
                                     </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <a
                                      href={`https://wa.me/${vol.whatsapp.replace(/\D/g, '')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"
                                    >
                                      Contactar <ExternalLink className="w-4 h-4" />
                                    </a>
                                    {vol.status === 'accepted' && vol.user_id && (
                                      <>
                                        <button onClick={() => handleVolunteerStatus(vol.id, 'suspended')} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors">Suspender</button>
                                      </>
                                    )}
                                    {vol.status === 'suspended' && vol.user_id && (
                                      <>
                                        <button onClick={() => handleVolunteerStatus(vol.id, 'accepted')} className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors">Reactivar</button>
                                      </>
                                    )}
                                    <button
                                      onClick={() => handleDeleteVolunteer(vol.id)}
                                      className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                                    >
                                      Eliminar <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                    </div>
                      </>
                    )}
                  </>
                );
              })()}
               </div>
            )}

          {/* ====== REPORTES PUBLICOS ====== */}
          {activeTab === 'public' && (
            <PublicReportsTab />
          )}

          {/* ====== WHATSAPP ====== */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-8">
              {/* Connection Settings */}
              <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
                <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
                  <MessageSquare className="w-6 h-6" /> Configuración WhatsApp Business
                </h2>
                <div className="space-y-5">
                  <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl">
                    <input
                      type="checkbox"
                      id="whatsapp_enabled"
                      checked={whatsappSettings.whatsapp_enabled === 'true'}
                      onChange={(e) => setWhatsappSettings(p => ({ ...p, whatsapp_enabled: e.target.checked ? 'true' : 'false' }))}
                      className="w-5 h-5 rounded accent-brand-primary"
                    />
                    <label htmlFor="whatsapp_enabled" className="font-bold text-brand-primary">Activar WhatsApp Business</label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'whatsapp_phone_number_id', label: 'Phone Number ID', type: 'text' },
                      { key: 'whatsapp_access_token', label: 'Access Token', type: 'password' },
                      { key: 'whatsapp_verify_token', label: 'Verify Token', type: 'password' },
                      { key: 'whatsapp_business_phone', label: 'Número WhatsApp (cód. país + nro)', type: 'text' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="block text-sm font-bold text-gray-600 mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          value={whatsappSettings[field.key] || ''}
                          onChange={(e) => setWhatsappSettings(p => ({ ...p, [field.key]: e.target.value }))}
                          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="p-5 bg-blue-50 rounded-2xl border border-blue-200">
                    <h3 className="text-sm font-bold text-blue-800 mb-4 flex items-center gap-2">📘 Guía: Conectar WhatsApp Business con Meta</h3>
                    <div className="space-y-3 text-sm text-blue-700">
                      {[
                        { n: 1, title: 'Ir al Meta Developer Portal',
                          desc: 'Andá a developers.facebook.com, creá o seleccioná una app y agregale el producto WhatsApp Cloud API.' },
                        { n: 2, title: 'Obtener credenciales',
                          desc: 'En la sección WhatsApp → Configuración, copiá Phone Number ID y generá un Access Token permanente. Inventá un Verify Token (ej: "sihuella2024") y guardalo.' },
                        { n: 3, title: 'Configurar Webhook en Meta',
                          desc: 'URL: https://sigotuhuella.online/api/whatsapp/webhook — Verify Token: el que inventaste — Click en "Verify and Save".' },
                        { n: 4, title: 'Suscribir a eventos',
                          desc: 'En la sección Webhooks, marcá el evento "messages" y guardá.' },
                        { n: 5, title: 'Completar campos y activar',
                          desc: 'Llená los campos de arriba con Phone Number ID, Access Token, Verify Token. Tildá "Activar WhatsApp Business" y guardá.' },
                      ].map(s => (
                        <div key={s.n} className="flex gap-3">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</span>
                          <div>
                            <p className="font-bold text-blue-800">{s.title}</p>
                            <p className="text-blue-600">{s.desc}</p>
                          </div>
                        </div>
                      ))}
                      <div className="mt-4 pt-4 border-t border-blue-200">
                        <p className="font-bold text-blue-800 mb-2">✅ Checklist final</p>
                        <ul className="space-y-1 text-blue-600">
                          <li>☐ Phone Number ID completo</li>
                          <li>☐ Access Token generado</li>
                          <li>☐ Verify Token coincide con el de Meta</li>
                          <li>☐ Webhook muestra "Active" en Meta</li>
                          <li>☐ WhatsApp activado en Admin</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Matching Settings */}
              <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
                <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
                  <FlaskConical className="w-6 h-6" /> Configuración de Matching
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-1">
                      <Map className="w-4 h-4 inline mr-1" /> Radio de búsqueda (km)
                    </label>
                    <input
                      type="number"
                      value={whatsappSettings.matching_radius_km || '20'}
                      onChange={(e) => setWhatsappSettings(p => ({ ...p, matching_radius_km: e.target.value }))}
                      className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                      min="1" max="500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Distancia máxima para considerar un match geográfico.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-1">Score mínimo (%)</label>
                    <input
                      type="number"
                      value={whatsappSettings.matching_min_score || '70'}
                      onChange={(e) => setWhatsappSettings(p => ({ ...p, matching_min_score: e.target.value }))}
                      className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
                      min="0" max="100"
                    />
                    <p className="text-xs text-gray-400 mt-1">Puntaje mínimo para enviar notificación de match.</p>
                  </div>
                </div>
              </div>

              {/* Greeting message */}
              <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
                <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
                  <MessageSquare className="w-6 h-6" /> Mensaje de Bienvenida
                </h2>
                <textarea
                  value={whatsappSettings.whatsapp_greeting || ''}
                  onChange={(e) => setWhatsappSettings(p => ({ ...p, whatsapp_greeting: e.target.value }))}
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm h-28 resize-none"
                  placeholder="Mensaje que se envía automáticamente cuando alguien escribe al WhatsApp..."
                />
                <p className="text-xs text-gray-400 mt-1">Las líneas con 1️⃣ 2️⃣ 3️⃣ generarán botones interactivos.</p>
              </div>

              {/* Save button */}
              <button
                onClick={async () => {
                  setSettingsLoading(true);
                  setSettingsSaved(false);
                  try {
                    await Promise.all(Object.entries(whatsappSettings).map(([key, value]) =>
                      api.settings.update(key, value)
                    ));
                    setSettingsSaved(true);
                    setTimeout(() => setSettingsSaved(false), 3000);
                  } catch (e) {
                    console.error(e);
                    alert('Error al guardar configuración');
                  }
                  setSettingsLoading(false);
                }}
                disabled={settingsLoading}
                className="px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
              >
                {settingsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {settingsLoading ? 'Guardando...' : settingsSaved ? '✅ Guardado' : 'Guardar Configuración'}
              </button>

              {/* Messages Log */}
              <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
                <h2 className="text-xl font-serif font-bold text-brand-primary mb-4 flex items-center gap-3">
                  <MessageSquare className="w-6 h-6" /> Reportes Recibidos
                </h2>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-500">Últimos mensajes recibidos</p>
                    <button onClick={fetchWaMessages} className="flex items-center gap-2 text-sm font-bold text-brand-primary hover:underline">
                      <RefreshCw className={`w-4 h-4 ${waMessagesLoading ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                  </div>
                  {waMessagesLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
                  ) : waMessages.length === 0 ? (
                    <div className="text-center py-10 bg-brand-bg rounded-2xl border border-dashed border-brand-accent">
                      <MessageSquare className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-400 font-medium">Aún no se recibieron mensajes</p>
                      <p className="text-xs text-gray-300 mt-1">Los mensajes aparecerán aquí cuando alguien escriba al WhatsApp.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-brand-accent">
                      <table className="w-full text-left text-sm min-w-max">
                        <thead>
                          <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                            <th className="px-4 py-3">Número</th>
                            <th className="px-4 py-3">Nombre</th>
                            <th className="px-4 py-3">Tipo</th>
                            <th className="px-4 py-3">Mensaje</th>
                            <th className="px-4 py-3">Usuario</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-accent">
                          {waMessages.map((msg: any) => (
                            <tr key={msg.id} className="hover:bg-brand-bg/50 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs">{msg.wa_from}</td>
                              <td className="px-4 py-3 font-medium text-brand-primary">{msg.sender_name || '—'}</td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  "text-[10px] px-2 py-1 rounded-full font-bold uppercase",
                                  msg.message_type === 'image' ? "bg-purple-100 text-purple-700" :
                                  msg.message_type === 'location' ? "bg-blue-100 text-blue-700" :
                                  msg.message_type === 'interactive' ? "bg-green-100 text-green-700" :
                                  "bg-gray-100 text-gray-600"
                                )}>{msg.message_type}</span>
                              </td>
                              <td className="px-4 py-3 max-w-[200px] truncate text-gray-500">{msg.text_body || '—'}</td>
                              <td className="px-4 py-3">{msg.user_name ? <span className="font-bold text-brand-primary">{msg.user_name}</span> : <span className="text-gray-400 text-xs">Anónimo</span>}</td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  "text-[10px] px-2 py-1 rounded-full font-bold uppercase",
                                  msg.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                                  msg.status === 'processed' ? "bg-blue-100 text-blue-700" :
                                  msg.status === 'matched' ? "bg-green-100 text-green-700" :
                                  "bg-gray-100 text-gray-600"
                                )}>{msg.status}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400">{new Date(msg.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
               </div>
             </div>
           )}

           {/* ====== VIDEOS ====== */}
{activeTab === 'videos' && (
  <VideoGeneratorTab />
)}

{activeTab === 'qr' && (
  <div className="space-y-6">
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
      <h3 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
        <QrCode className="w-5 h-5" /> Generar lote de QRs
      </h3>
      <div className="flex items-end gap-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Cantidad</label>
          <input
            type="number" min={1} max={500} value={qrBatchCount}
            onChange={e => setQrBatchCount(parseInt(e.target.value) || 12)}
            className="w-24 mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
          />
        </div>
        <button
          onClick={handleQrBatch}
          disabled={qrBatchLoading}
          className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {qrBatchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          Generar
        </button>
      </div>
    </div>

    {qrRequests.length > 0 && (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h3 className="text-lg font-bold text-brand-primary mb-4">Solicitudes de QR ({qrRequests.length})</h3>
        <div className="space-y-3">
          {qrRequests.map((req: any) => (
            <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-brand-bg rounded-2xl">
              <div>
                <p className="text-sm font-bold text-gray-800">{req.name} <span className="font-normal text-gray-400">({req.species}{req.breed ? ` · ${req.breed}` : ''})</span></p>
                <p className="text-xs text-gray-400">De: {req.display_name} {req.email ? `· ${req.email}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  onChange={async (e) => {
                    if (e.target.value) await handleQrAssign(e.target.value, req.id);
                  }}
                  disabled={qrAssignLoading === req.id}
                  className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>Asignar QR...</option>
                  {qrUnassigned.map(qr => (
                    <option key={qr.id} value={qr.id}>{qr.code}</option>
                  ))}
                </select>
                {qrAssignLoading === req.id && <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {qrUnassigned.length > 0 && (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h3 className="text-lg font-bold text-brand-primary mb-4">QRs sin asignar ({qrUnassigned.length})</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {[...new Set(qrUnassigned.map((q: any) => q.batch_id))].map(batchId => (
            <button
              key={batchId}
              onClick={() => handleQrPdf(batchId)}
              className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-brand-primary/20 transition-colors"
            >
              <Download className="w-3 h-3" /> PDF {batchId?.replace('batch-', '').slice(0, 6)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {qrUnassigned.slice(0, 48).map((qr: any) => (
            <div key={qr.id} className="p-2 bg-brand-bg rounded-xl text-center">
              <p className="text-xs font-mono font-bold text-brand-primary">{qr.code}</p>
            </div>
          ))}
          {qrUnassigned.length > 48 && (
            <div className="p-2 bg-brand-bg rounded-xl text-center flex items-center justify-center">
              <p className="text-xs text-gray-400">+{qrUnassigned.length - 48}</p>
            </div>
          )}
        </div>
      </div>
    )}

    {qrRequests.length === 0 && qrUnassigned.length === 0 && (
      <div className="bg-white rounded-[2.5rem] border border-dashed border-brand-accent p-8 text-center">
        <QrCode className="w-12 h-12 text-brand-accent mx-auto mb-3" />
        <p className="text-gray-400">No hay QRs generados ni solicitudes pendientes.</p>
      </div>
    )}
  </div>
)}
          </div>
        )}

      {/* Form Modals */}
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
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Nombre</label>
                    <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Especie</label>
                    <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.species} onChange={e => setFormData({...formData, species: e.target.value as any})}>
                      <option value="dog">Perro</option>
                      <option value="cat">Gato</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Estado</label>
                  <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                    <option value={PetStatus.LOST}>Perdido</option>
                    <option value={PetStatus.RETAINED}>Retenido</option>
                    <option value={PetStatus.SIGHTED}>Avistado</option>
                    <option value={PetStatus.ACCIDENTED}>Accidentado</option>
                    <option value={PetStatus.NEEDS_ATTENTION}>Necesita Atención</option>
                    <option value={PetStatus.FOR_ADOPTION}>Para Adopción</option>
                  </select>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Ubicación</label>
                    <input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Contacto (WhatsApp / Teléfono)</label>
                    <input type="tel" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.contactInfo} onChange={e => setFormData({...formData, contactInfo: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Descripción</label>
                  <textarea required rows={3} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
                {formData.status === PetStatus.FOR_ADOPTION && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-500">Edad</label>
                        <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} placeholder="Ej: 2 años, cachorro" />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-500">Tamaño</label>
                        <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value as any})}>
                          <option value="small">Pequeño</option>
                          <option value="medium">Mediano</option>
                          <option value="large">Grande</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-500">Sexo</label>
                        <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as any})}>
                          <option value="male">Macho</option>
                          <option value="female">Hembra</option>
                          <option value="unknown">No especificado</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-6">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={formData.isDewormed} onChange={e => setFormData({...formData, isDewormed: e.target.checked})} className="w-4 h-4 accent-brand-primary" />
                        <span className="text-gray-700 font-medium">Desparasitado</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={formData.isVaccinated} onChange={e => setFormData({...formData, isVaccinated: e.target.checked})} className="w-4 h-4 accent-brand-primary" />
                        <span className="text-gray-700 font-medium">Vacunado</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={formData.isSterilized} onChange={e => setFormData({...formData, isSterilized: e.target.checked})} className="w-4 h-4 accent-brand-primary" />
                        <span className="text-gray-700 font-medium">Esterilizado/Castrado</span>
                      </label>
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Imágenes</label>
                  <input type="file" accept="image/*" multiple onChange={async e => { const raw = Array.from(e.target.files || []) as File[]; const compressed = await Promise.all(raw.map(f => compressImage(f))); setSelectedFiles(prev => [...prev, ...compressed]); setPreviews(prev => [...prev, ...compressed.map(f => URL.createObjectURL(f))]); }} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
                  {previews.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {previews.map((src, i) => (
                        <div key={i} className="relative w-20 h-20">
                          <img src={src} className="w-full h-full object-cover rounded-xl" />
                          <button type="button" onClick={() => {
                            setPreviews(prev => prev.filter((_, j) => j !== i));
                            setImagesToKeep(prev => prev.filter((_, j) => j !== i));
                            setSelectedFiles(prev => {
                              const keepCount = imagesToKeep.length;
                              const fileIdx = i - keepCount;
                              if (fileIdx < 0) return prev;
                              return prev.filter((_, j) => j !== fileIdx);
                            });
                          }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold uppercase text-gray-500">Banco</label><input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.bankName} onChange={e => setCollabData({...collabData, bankName: e.target.value})} /></div>
                  <div><label className="text-xs font-bold uppercase text-gray-500">Alias</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.alias} onChange={e => setCollabData({...collabData, alias: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold uppercase text-gray-500">CBU</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.cbu} onChange={e => setCollabData({...collabData, cbu: e.target.value})} /></div>
                  <div><label className="text-xs font-bold uppercase text-gray-500">CVU</label><input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.cvu} onChange={e => setCollabData({...collabData, cvu: e.target.value})} /></div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Link de Mercado Pago (opcional)</label>
                  <input type="url" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={collabData.mercadopagoLink} onChange={e => setCollabData({...collabData, mercadopagoLink: e.target.value})} placeholder="https://mpago.la/..." />
                  <p className="text-[10px] text-gray-400 mt-1">Creá un Link de Pago en tu cuenta de Mercado Pago y pegalo acá. Aparecerá un botón de "Donar con Mercado Pago" en la página Colaborar.</p>
                </div>
                <button type="submit" disabled={formLoading} className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold">{formLoading ? <Loader2 className="animate-spin" /> : 'Guardar Datos'}</button>
              </form>
            </motion.div>
          </div>
        )}

        {showNewsForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNewsForm(false)} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <h2 className="text-2xl font-serif font-bold text-brand-primary">{editingNews ? 'Editar Novedad' : 'Nueva Novedad'}</h2>
                <button onClick={() => { setShowNewsForm(false); resetNewsForm(); }} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleNewsSubmit} className="p-8 overflow-y-auto space-y-6">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Título</label>
                  <input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={newsFormData.title} onChange={e => setNewsFormData({...newsFormData, title: e.target.value})} />
                </div>
                <div className="border-t border-brand-accent pt-4">
                  <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Generar con IA</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={aiType} onChange={e => setAiType(e.target.value)} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm">
                      <option value="consejo_cuidado">Consejo de cuidado</option>
                      <option value="historia_adopcion">Historia de adopción</option>
                      <option value="tips_bienestar">Tips de bienestar</option>
                      <option value="dato_curioso">Dato curioso</option>
                    </select>
                    <input type="text" value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Tema (opcional)" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm" />
                  </div>
                  <button type="button" onClick={handleAiGenerate} disabled={aiGenerating} className="mt-3 w-full py-3 bg-gradient-to-r from-brand-primary to-brand-accent text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                    {aiGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                    {aiGenerating ? 'Generando...' : 'Generar con IA 🤖'}
                  </button>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Contenido</label>
                  <textarea required rows={8} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={newsFormData.content} onChange={e => setNewsFormData({...newsFormData, content: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">URL de Video (opcional)</label>
                  <input type="url" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={newsFormData.videoUrl} onChange={e => setNewsFormData({...newsFormData, videoUrl: e.target.value})} placeholder="https://youtube.com/..." />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Imagen de portada</label>
                  <input type="file" accept="image/*" onChange={handleNewsFileChange} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
                  {newsPreview && (
                    <img src={newsPreview} className="mt-3 w-40 h-28 object-cover rounded-xl border border-brand-accent" />
                  )}
                </div>
                <button type="submit" disabled={newsFormLoading} className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold">
                  {newsFormLoading ? <Loader2 className="animate-spin mx-auto" /> : <Save className="w-5 h-5 inline mr-2" />} Guardar
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {trackPet && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTrackPet(null)} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <div>
                  <h2 className="text-xl font-serif font-bold text-brand-primary">{trackPet.name || 'Mascota'}</h2>
                  <p className="text-xs text-gray-500 capitalize">{trackPet.species === 'dog' ? 'Perro' : trackPet.species === 'cat' ? 'Gato' : 'Otra especie'} · {trackPet.location}</p>
                </div>
                <button onClick={() => setTrackPet(null)} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-5 h-5" /></button>
              </div>

              {!showRecordForm ? (
                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Summary cards */}
                  {recordsSummary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-brand-bg rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-brand-primary">${parseFloat(recordsSummary.total_expenses || 0).toLocaleString('es-AR')}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Gastos</div>
                      </div>
                      <div className="bg-brand-bg rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{recordsSummary.next_date ? new Date(recordsSummary.next_date).toLocaleDateString() : '-'}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Próximo</div>
                      </div>
                      <div className="bg-brand-bg rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-brand-primary">{recordsSummary.last_date ? new Date(recordsSummary.last_date).toLocaleDateString() : '-'}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Último</div>
                      </div>
                      <div className="bg-brand-bg rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-brand-primary">{recordsSummary.total || 0}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Registros</div>
                      </div>
                    </div>
                  )}

                  {/* New record + PDF buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 justify-end">
                    <button onClick={() => { resetRecordForm(); setShowRecordForm(true); }} className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:shadow-lg transition-all">
                      <Plus className="w-4 h-4" /> Nuevo Registro
                    </button>
                    <button onClick={() => { if (trackPet) { handlePreviewPdf(trackPet.id); } }} className="px-5 py-2.5 bg-white border border-brand-accent text-brand-primary rounded-xl font-bold text-sm flex items-center gap-2 hover:border-brand-primary hover:shadow transition-all">
                      <FileText className="w-4 h-4" /> Vista previa PDF
                    </button>
                    <button onClick={() => { if (trackPet) api.pets.records.report(trackPet.id); }} className="px-5 py-2.5 bg-white border border-brand-accent text-brand-primary rounded-xl font-bold text-sm flex items-center gap-2 hover:border-brand-primary hover:shadow transition-all">
                      <Download className="w-4 h-4" /> Descargar PDF
                    </button>
                  </div>

                  {/* PDF Preview */}
                  {pdfPreviewUrl && (
                    <div className="bg-white rounded-2xl border border-brand-accent overflow-hidden">
                      <div className="flex items-center justify-between p-3 bg-brand-bg/50 border-b border-brand-accent">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Vista previa</p>
                        <div className="flex gap-2">
                          <a href={pdfPreviewUrl} download={pdfFilename} className="px-3 py-1.5 bg-brand-primary text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:shadow transition-all">
                            <Download className="w-3 h-3" /> Descargar
                          </a>
                          <button onClick={() => { setPdfPreviewUrl(null); URL.revokeObjectURL(pdfPreviewUrl); }} className="px-3 py-1.5 border border-brand-accent rounded-lg text-xs font-bold text-gray-500 hover:bg-brand-bg transition-all">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <embed src={pdfPreviewUrl} type="application/pdf" className="w-full h-[500px]" />
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="space-y-3">
                    {petRecords.length === 0 ? (
                      <div className="text-center py-12 bg-brand-bg rounded-2xl border-2 border-dashed border-brand-accent">
                        <p className="text-gray-400 font-medium">No hay registros de seguimiento aún.</p>
                      </div>
                    ) : (
                      petRecords.map((rec) => {
                        const typeConfig: Record<string, { label: string; color: string }> = {
                          appointment: { label: 'Turno', color: 'bg-green-100 text-green-700' },
                          study: { label: 'Estudio', color: 'bg-blue-100 text-blue-700' },
                          expense: { label: 'Gasto', color: 'bg-orange-100 text-orange-700' },
                          medication: { label: 'Medicación', color: 'bg-purple-100 text-purple-700' },
                          vaccine: { label: 'Vacuna', color: 'bg-teal-100 text-teal-700' },
                          surgery: { label: 'Cirugía', color: 'bg-red-100 text-red-700' },
                          note: { label: 'Nota', color: 'bg-gray-100 text-gray-700' },
                        };
                        const tc = typeConfig[rec.record_type] || { label: rec.record_type, color: 'bg-gray-100 text-gray-700' };
                        return (
                          <div key={rec.id} className="bg-white p-4 rounded-2xl border border-brand-accent shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] text-gray-400">{new Date(rec.record_date).toLocaleDateString()}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${tc.color}`}>{tc.label}</span>
                                </div>
                                <h4 className="text-sm font-bold text-gray-800">{rec.title}</h4>
                                {rec.description && <p className="text-xs text-gray-600 mt-1">{rec.description}</p>}
                                {(rec.vet_name || rec.clinic_name) && <p className="text-[11px] text-gray-500 mt-1">🏥 {[rec.vet_name, rec.clinic_name].filter(Boolean).join(' · ')}</p>}
                                {(rec.medication_name || rec.dosage) && <p className="text-[11px] text-gray-500 mt-1">💊 {[rec.medication_name, rec.dosage].filter(Boolean).join(' · ')}</p>}
                                {rec.amount && <p className="text-xs font-bold text-brand-primary mt-1">${parseFloat(rec.amount).toLocaleString('es-AR')}</p>}
                                {rec.next_date && <p className="text-[11px] text-amber-600 mt-1">📅 Próximo: {new Date(rec.next_date).toLocaleDateString()}</p>}
                                {rec.attachment_data && (
                                  <a href={`data:${rec.attachment_type};base64,${rec.attachment_data}`} download={rec.attachment_name || 'adjunto'} className="inline-flex items-center gap-1 text-[11px] text-brand-primary font-bold hover:underline mt-1">
                                    <Download className="w-3 h-3" /> {rec.attachment_name || 'Descargar'}
                                  </a>
                                )}
                              </div>
                              <button onClick={() => handleDeleteRecord(rec.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-6">
                    <button onClick={() => setShowRecordForm(false)} className="text-sm text-gray-400 hover:text-brand-primary transition-colors">← Volver</button>
                    <span className="text-sm font-bold text-brand-primary">Nuevo Registro</span>
                  </div>
                  <form onSubmit={handleRecordSubmit} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">Tipo</label>
                      <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.recordType} onChange={e => setRecordFormData({...recordFormData, recordType: e.target.value})}>
                        <option value="appointment">Turno</option>
                        <option value="study">Estudio</option>
                        <option value="expense">Gasto</option>
                        <option value="medication">Medicación</option>
                        <option value="vaccine">Vacuna</option>
                        <option value="surgery">Cirugía</option>
                        <option value="note">Nota</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">Título *</label>
                      <input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.title} onChange={e => setRecordFormData({...recordFormData, title: e.target.value})} placeholder="Ej: Control veterinario" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">Descripción</label>
                      <textarea rows={2} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.description} onChange={e => setRecordFormData({...recordFormData, description: e.target.value})} placeholder="Detalles..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-500">Fecha</label>
                        <input required type="date" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.recordDate} onChange={e => setRecordFormData({...recordFormData, recordDate: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-500">Próxima fecha</label>
                        <input type="date" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.nextDate} onChange={e => setRecordFormData({...recordFormData, nextDate: e.target.value})} />
                      </div>
                    </div>
                    {recordFormData.recordType === 'expense' && (
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-500">Monto ($)</label>
                        <input type="number" step="0.01" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.amount} onChange={e => setRecordFormData({...recordFormData, amount: e.target.value})} placeholder="0.00" />
                      </div>
                    )}
                    {(recordFormData.recordType === 'appointment' || recordFormData.recordType === 'study' || recordFormData.recordType === 'surgery') && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold uppercase text-gray-500">Veterinario</label>
                          <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.vetName} onChange={e => setRecordFormData({...recordFormData, vetName: e.target.value})} placeholder="Dr. Apellido" />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase text-gray-500">Clínica</label>
                          <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.clinicName} onChange={e => setRecordFormData({...recordFormData, clinicName: e.target.value})} placeholder="Nombre" />
                        </div>
                      </div>
                    )}
                    {recordFormData.recordType === 'medication' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold uppercase text-gray-500">Medicamento</label>
                          <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.medicationName} onChange={e => setRecordFormData({...recordFormData, medicationName: e.target.value})} placeholder="Nombre" />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase text-gray-500">Dosis</label>
                          <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={recordFormData.dosage} onChange={e => setRecordFormData({...recordFormData, dosage: e.target.value})} placeholder="Ej: 1 comprimido/día" />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">Archivo adjunto</label>
                      <input type="file" accept=".pdf,image/*" onChange={handleRecordFileChange} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
                      {recordFileName && <p className="text-xs text-gray-500 mt-1">📎 {recordFileName}</p>}
                    </div>
                    <button type="submit" disabled={recordFormLoading} className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold">
                      {recordFormLoading ? <Loader2 className="animate-spin mx-auto" /> : <Save className="w-5 h-5 inline mr-2" />} Guardar
                    </button>
                  </form>
                </div>
              )}
            </motion.div>
          </div>
        )}



        {sharePet && (
          <SocialShareModal pet={sharePet} onClose={() => setSharePet(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PublicReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await api.pets.listPublic();
      setReports(data.pets || []);
    } catch (err) {
      console.error('Failed to fetch public reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este reporte público?')) return;
    try {
      await api.pets.delete(id);
      fetchReports();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-bold text-brand-primary">Reportes Públicos</h2>
          <p className="text-sm text-gray-500 mt-1">Reportes ingresados por el formulario rápido sin registro.</p>
        </div>
        <button onClick={fetchReports} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-brand-primary border border-brand-accent rounded-xl hover:bg-brand-primary/5 transition-colors">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[2.5rem] border border-brand-accent">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay reportes públicos pendientes.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[2.5rem] border border-brand-accent bg-white">
          <table className="w-full text-left text-sm min-w-max">
            <thead className="bg-brand-bg border-b border-brand-accent">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-700">Especie</th>
                <th className="px-6 py-4 font-bold text-gray-700">Descripción</th>
                <th className="px-6 py-4 font-bold text-gray-700">Ubicación</th>
                <th className="px-6 py-4 font-bold text-gray-700">Contacto</th>
                <th className="px-6 py-4 font-bold text-gray-700">Fecha</th>
                <th className="px-6 py-4 font-bold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {reports.map((report: any) => (
                <tr key={report.id} className="hover:bg-brand-bg/50 transition-colors">
                  <td className="px-6 py-4 capitalize">{report.species}</td>
                  <td className="px-6 py-4 max-w-xs">
                    <p className="truncate">{report.description}</p>
                  </td>
                  <td className="px-6 py-4">{report.location}</td>
                  <td className="px-6 py-4">{report.contact_info || <span className="text-gray-400">—</span>}</td>
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {new Date(report.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => window.open(`/pet/${report.id}`, '_blank')} className="p-2 hover:bg-brand-primary/10 rounded-lg transition-colors text-brand-primary" title="Ver">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(report.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}