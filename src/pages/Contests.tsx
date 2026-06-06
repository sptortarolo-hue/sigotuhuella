import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Heart, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '@/src/hooks/useAuth';

const speciesEmoji: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' };

export default function Contests() {
  const { user } = useAuth();
  const [contest, setContest] = useState<any>(null);
  const [nominees, setNominees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [showNominate, setShowNominate] = useState(false);
  const [myPets, setMyPets] = useState<any[]>([]);
  const [nominating, setNominating] = useState(false);

  useEffect(() => {
    fetchActiveContest();
  }, []);

  const fetchActiveContest = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/contests/active');
      if (data) {
        setContest(data.contest);
        setNominees(data.nominees);
      } else {
        setContest(null);
        setNominees([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleVote = async (nomineeId: string) => {
    if (!user) return;
    setVotingId(nomineeId);
    try {
      await api.post(`/api/contests/${nomineeId}/vote`);
      await fetchActiveContest();
    } catch (e: any) {
      alert(e.message || 'Error al votar');
    }
    finally { setVotingId(null); }
  };

  const openNominate = async () => {
    if (!user) return;
    try {
      const pets = await api.myPets.list();
      setMyPets(pets.filter((p: any) => !nominees.find((n: any) => n.my_pet_id === p.id)));
      setShowNominate(true);
    } catch (e) { console.error(e); }
  };

  const handleNominate = async (petId: string) => {
    if (!contest) return;
    setNominating(true);
    try {
      await api.post(`/api/contests/${contest.id}/nominate`, { my_pet_id: petId });
      setShowNominate(false);
      await fetchActiveContest();
    } catch (e: any) {
      alert(e.message || 'Error al nominar');
    }
    finally { setNominating(false); }
  };

  const getEndDate = () => {
    if (!contest) return '';
    const end = new Date(contest.end_date);
    return end.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getDaysLeft = () => {
    if (!contest) return 0;
    const end = new Date(contest.end_date);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16 text-center">
        <Trophy className="w-16 h-16 text-brand-accent mx-auto mb-4" />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Mascota del Mes</h1>
        <p className="text-gray-400 mb-8">No hay un concurso activo en este momento.</p>
        <p className="text-sm text-gray-400">Volvé pronto para participar en el próximo concurso.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 mb-4">
          <Trophy className="w-8 h-8" />
        </motion.div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{contest.title}</h1>
        {contest.description && <p className="text-gray-500 mt-2">{contest.description}</p>}
        <div className="flex items-center justify-center gap-4 mt-4 text-sm text-gray-400">
          <span>Finaliza: {getEndDate()}</span>
          <span className="flex items-center gap-1 text-amber-600 font-bold">
            <Sparkles className="w-3 h-3" />
            {getDaysLeft()} días restantes
          </span>
        </div>
      </div>

      {/* Nominees Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {nominees.map((nominee, i) => (
          <motion.div key={nominee.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-[2rem] border border-brand-accent overflow-hidden"
          >
            <div className="aspect-square bg-brand-bg relative overflow-hidden">
              {nominee.has_avatar ? (
                <img src={`/my-pet-avatar/${nominee.my_pet_id}`} alt={nominee.pet_name}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl">
                  {speciesEmoji[nominee.species] || '🐾'}
                </div>
              )}
              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1 text-sm font-bold text-gray-800">
                #{i + 1}
              </div>
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1 text-sm font-bold text-amber-600 flex items-center gap-1">
                <Heart className="w-3 h-3 fill-current" />
                {nominee.votes_count}
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-800">{nominee.pet_name}</h3>
                  <p className="text-xs text-gray-400">de {nominee.owner_name}</p>
                </div>
                <span className="text-lg">{speciesEmoji[nominee.species] || '🐾'}</span>
              </div>
              {user && !nominee.user_voted ? (
                <button onClick={() => handleVote(nominee.id)} disabled={votingId === nominee.id}
                  className="w-full py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {votingId === nominee.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
                  Votar
                </button>
              ) : nominee.user_voted ? (
                <div className="w-full py-2 rounded-xl bg-amber-50 text-amber-600 text-sm font-bold text-center flex items-center justify-center gap-2">
                  <Heart className="w-4 h-4 fill-current" />
                  Votaste
                </div>
              ) : (
                <Link to="/login" className="block w-full py-2 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold text-center hover:bg-gray-200 transition-colors">
                  Iniciá sesión para votar
                </Link>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Nominate button */}
      {user && (
        <div className="text-center mt-8">
          <button onClick={openNominate}
            className="px-6 py-3 bg-white rounded-xl border-2 border-dashed border-brand-accent text-gray-400 hover:text-brand-primary hover:border-brand-primary transition-colors text-sm font-bold"
          >
            + Nominá a tu mascota
          </button>
        </div>
      )}

      {/* Nominate modal */}
      <AnimatePresence>
        {showNominate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowNominate(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 sm:p-8 max-h-[90vh] flex flex-col overflow-y-auto"
            >
              <h2 className="text-xl font-bold text-gray-800 mb-4">Nominar mascota</h2>
              {myPets.length === 0 ? (
                <p className="text-gray-400 text-sm">No tenés mascotas disponibles para nominar.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {myPets.map((pet: any) => (
                    <button key={pet.id} onClick={() => handleNominate(pet.id)} disabled={nominating}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-bg transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-lg shrink-0">
                        {pet.avatar_image ? <img src={`/my-pet-avatar/${pet.id}`} className="w-full h-full object-cover rounded-xl" /> : (speciesEmoji[pet.species] || '🐾')}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{pet.name}</p>
                        <p className="text-xs text-gray-400">{pet.species}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowNominate(false)}
                className="mt-4 w-full py-2 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold"
              >Cancelar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
