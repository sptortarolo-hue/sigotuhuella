import { useState, useEffect } from 'react';
import { Users, Plus, LogIn, Loader2, X, Copy, Check, UserMinus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function FamilySection() {
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchFamilies = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/families', { credentials: 'include' });
      if (!res.ok) { setFamilies([]); return; }
      const data = await res.json();
      setFamilies(data);
    } catch (e) { setFamilies([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFamilies(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/families', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName('');
        await fetchFamilies();
      }
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const handleJoin = async () => {
    if (!code.trim()) return;
    setJoining(true);
    try {
      const res = await fetch('/api/families/join', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        setShowJoin(false);
        setCode('');
        await fetchFamilies();
      }
    } catch (e) { console.error(e); }
    finally { setJoining(false); }
  };

  const toggleExpand = async (familyId: string) => {
    if (expanded === familyId) { setExpanded(null); return; }
    setExpanded(familyId);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/families/${familyId}/members`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setMembers(data); }
    } catch (e) { console.error(e); }
    finally { setMembersLoading(false); }
  };

  const handleRemoveMember = async (familyId: string, userId: string) => {
    try {
      await fetch(`/api/families/${familyId}/members/${userId}`, {
        method: 'DELETE', credentials: 'include',
      });
      await toggleExpand(familyId);
    } catch (e) { console.error(e); }
  };

  const handleDeleteFamily = async (familyId: string) => {
    if (!confirm('¿Eliminar esta familia? Se perderán todos los miembros.')) return;
    try {
      await fetch(`/api/families/${familyId}`, { method: 'DELETE', credentials: 'include' });
      setExpanded(null);
      await fetchFamilies();
    } catch (e) { console.error(e); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 lg:p-6">
      <div className="flex items-center justify-between mb-3 lg:mb-4">
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Users className="w-4 h-4" /> Mi Familia
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setShowJoin(true)}
            className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg text-[10px] lg:text-xs font-bold flex items-center gap-1 hover:bg-brand-primary/20 transition-all">
            <LogIn className="w-3 h-3" /> Unirse
          </button>
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-brand-primary text-white rounded-lg text-[10px] lg:text-xs font-bold flex items-center gap-1 hover:shadow-md transition-all">
            <Plus className="w-3 h-3" /> Crear
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
        </div>
      ) : families.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-accent p-5 lg:p-6 text-center">
          <Users className="w-8 h-8 text-brand-accent mx-auto mb-2" />
          <p className="text-xs lg:text-sm text-gray-500 mb-3">Crea o unite a una familia para compartir mascotas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {families.map(family => (
            <div key={family.id} className="rounded-xl border border-brand-accent overflow-hidden">
              <button
                onClick={() => toggleExpand(family.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-brand-bg transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-bold text-gray-700">{family.name}</p>
                  <p className="text-[10px] text-gray-400">{family.member_count} miembro{family.member_count !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); copyCode(family.invite_code); }}
                    className="px-2 py-1 bg-brand-bg rounded-lg text-[10px] font-medium text-gray-500 hover:text-brand-primary flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {family.invite_code}
                  </button>
                </div>
              </button>

              <AnimatePresence>
                {expanded === family.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="border-t border-brand-accent">
                    <div className="p-3 space-y-2">
                      {membersLoading ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-brand-accent" /></div>
                      ) : members.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">Sin miembros</p>
                      ) : (
                        members.map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {m.avatar_data ? (
                                <img src={`data:${m.avatar_mime_type};base64,${m.avatar_data}`} alt=""
                                  className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-brand-accent flex items-center justify-center shrink-0">
                                  <Users className="w-3 h-3 text-gray-400" />
                                </div>
                              )}
                              <span className="text-xs font-medium text-gray-700 truncate">
                                {m.display_name || m.email}
                                {m.is_owner && <span className="text-[10px] text-gray-400 ml-1">(dueño)</span>}
                              </span>
                            </div>
                            {m.is_owner && (
                              <button onClick={() => handleDeleteFamily(family.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                            {!m.is_owner && (
                              <button onClick={() => handleRemoveMember(family.id, m.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                <UserMinus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] p-6">
              <button onClick={() => setShowCreate(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Crear familia</h3>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Nombre de la familia"
                className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm mb-4"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <button onClick={handleCreate} disabled={creating || !name.trim()}
                className="w-full py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear familia
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join modal */}
      <AnimatePresence>
        {showJoin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] p-6">
              <button onClick={() => setShowJoin(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Unirse a una familia</h3>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Código de invitación"
                className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm mb-4 uppercase tracking-widest"
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
              <button onClick={handleJoin} disabled={joining || !code.trim()}
                className="w-full py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {joining && <Loader2 className="w-4 h-4 animate-spin" />}
                Unirse
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}