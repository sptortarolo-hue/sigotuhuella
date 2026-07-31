import { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { Loader2, Eye, TrendingUp, Calendar, BarChart3, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalyticsData {
  totalViews: number;
  viewsToday: number;
  viewsThisWeek: number;
  uniqueVisitors: number;
  uniqueVisitorsToday: number;
  uniqueVisitorsWeek: number;
  topPets: { id: string; name: string; species: string; status: string; view_count: number; has_image: boolean }[];
  viewsByDay: { date: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  lost: 'Perdido', sighted: 'Avistado', retained: 'Retenido',
  for_adoption: 'En adopción', for_adoption_simple: 'Adopción simple',
  adopted: 'Adoptado', reunited: 'Reencontrado',
  accidented: 'Accidentado', needs_attention: 'Necesita atención',
  transitada: 'En tránsito',
};

export default function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminDashboard.analytics()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-gray-500 py-8">Error al cargar analytics</p>;
  }

  const chartData = data.viewsByDay.map(d => ({
    date: new Date(d.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
    vistas: d.count,
  }));

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-brand-accent p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center">
            <Eye className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-brand-primary">{data.totalViews.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Vistas totales</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-brand-accent p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">{data.viewsToday.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Vistas hoy</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-brand-accent p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">{data.viewsThisWeek.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Vistas esta semana</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-brand-accent p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">{data.uniqueVisitors.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Visitantes únicos (30d)</p>
          </div>
        </div>
      </div>

      {/* Ratio views per visitor */}
      <div className="bg-white rounded-2xl border border-brand-accent p-4 text-center">
        <p className="text-sm text-gray-500">
          Ratio vistas/visitante (30d): <span className="font-bold text-brand-primary ml-2">
            {(data.totalViews / (data.uniqueVisitors || 1)).toFixed(1)}x
          </span>
        </p>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-accent p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Vistas por día (últimos 30 días)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="vistas" stroke="#7c6f5b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top pets */}
      {data.topPets.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-accent p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Mascotas más vistas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-accent">
                  <th className="text-left py-2 font-bold text-gray-500">#</th>
                  <th className="text-left py-2 font-bold text-gray-500">Mascota</th>
                  <th className="text-left py-2 font-bold text-gray-500">Especie</th>
                  <th className="text-left py-2 font-bold text-gray-500">Estado</th>
                  <th className="text-right py-2 font-bold text-gray-500">Vistas</th>
                </tr>
              </thead>
              <tbody>
                {data.topPets.map((pet, i) => (
                  <tr key={pet.id} className="border-b border-brand-accent/50 last:border-0">
                    <td className="py-2.5 text-gray-400 font-bold">{i + 1}</td>
                    <td className="py-2.5 font-bold text-brand-primary">{pet.name || 'Sin nombre'}</td>
                    <td className="py-2.5 text-gray-600">{pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro'}</td>
                    <td className="py-2.5">
                      <span className="text-xs font-bold px-2 py-1 rounded-full bg-brand-bg text-gray-600">
                        {STATUS_LABELS[pet.status] || pet.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-brand-primary">{pet.view_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
