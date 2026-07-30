import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import {
  PawPrint, Loader2, CheckCircle2, Heart, Mail, Phone, User,
  ArrowLeft, MessageCircle,
} from 'lucide-react';
import { motion } from 'motion/react';

export default function AdoptionClaim() {
  const { token } = useParams<{ token: string }>();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      api.adoptionAssignments.checkToken(token)
        .then(r => setData(r))
        .catch(() => setError('Invitación no válida'))
        .finally(() => setLoading(false));
    }
  }, [token]);

  const handleClaim = async () => {
    setClaiming(true);
    setError('');
    try {
      await api.adoptionAssignments.claim(token!);
      setClaimed(true);
    } catch (e: any) {
      setError(e.message || 'Error al reclamar');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!data || !data.found) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <PawPrint className="w-16 h-16 text-brand-accent mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-brand-primary mb-3">Invitación no encontrada</h1>
          <p className="text-gray-500 mb-6">Este link de adopción no es válido o ya fue procesado.</p>
          <Link to="/" className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm">
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">¡Adopción confirmada!</h1>
          <p className="text-gray-600 mb-2">
            {data.assignment.pet_name} ahora es parte de tu familia. La chapita QR ya está asociada a tu cuenta.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Podés verla en tu sección "Mis mascotas".
          </p>
          <button onClick={() => navigate('/mi-mascota')}
            className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
            Ir a mis mascotas
          </button>
        </motion.div>
      </div>
    );
  }

  const ass = data.assignment;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 shadow-xl"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-brand-primary">¡Te invitaron a adoptar!</h1>
          <p className="text-gray-500 text-sm mt-2">
            {ass.adopter_name}, te invitaron a adoptar a <strong>{ass.pet_name}</strong>
          </p>
        </div>

        <div className="bg-brand-bg rounded-2xl p-4 mb-6 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <PawPrint className="w-4 h-4 text-brand-primary" />
            <span className="text-gray-700"><strong>{ass.pet_name}</strong></span>
          </div>
          {ass.species && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{ass.species === 'dog' ? 'Perro' : ass.species === 'cat' ? 'Gato' : ass.species}{ass.breed ? ` · ${ass.breed}` : ''}</span>
            </div>
          )}
          {ass.color && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">Color: {ass.color}</span>
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-800">
          <p className="font-medium mb-1">¿Qué tenés que hacer?</p>
          <ol className="space-y-1 text-amber-700 list-decimal list-inside">
            <li>Iniciá sesión o registrate en Sigo Tu Huella</li>
            <li>Confirmá la adopción con un clic</li>
            <li>La mascota aparecerá automáticamente en "Mis mascotas"</li>
          </ol>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</div>
        )}

        {user ? (
          <button onClick={handleClaim} disabled={claiming}
            className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
            {claiming ? 'Confirmando...' : 'Confirmar adopción'}
          </button>
        ) : (
          <div className="space-y-3">
            <Link to={`/login?redirect=/adopcion/reclamar/${token}`}
              className="block w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm text-center hover:shadow-lg transition-all"
            >
              Iniciar sesión
            </Link>
            <Link to={`/register?redirect=/adopcion/reclamar/${token}`}
              className="block w-full py-3 bg-white text-brand-primary border border-brand-primary rounded-xl font-bold text-sm text-center hover:bg-brand-primary/5 transition-all"
            >
              Registrarme
            </Link>
          </div>
        )}

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Volver al inicio
          </Link>
        </div>
      </motion.div>
    </div>
  );
}