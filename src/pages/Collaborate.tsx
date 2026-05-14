import React, { useState, useEffect } from 'react';
import { getCollaborationAccounts, CollaborationAccount } from '@/src/lib/collaborationService';
import { CreditCard, Copy, Check, Loader2, Heart, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function Collaborate() {
  const [accounts, setAccounts] = useState<CollaborationAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const data = await getCollaborationAccounts();
      setAccounts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
      <header className="text-center mb-16">
        <div className="inline-flex p-3 bg-red-100 text-red-600 rounded-2xl mb-6">
          <Heart className="w-8 h-8 fill-current" />
        </div>
        <h1 className="text-5xl font-serif font-bold text-brand-primary mb-6 tracking-tight">Colaborar con el rescate</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Tu ayuda económica es fundamental para sostener nuestra labor. Todo lo recaudado se destina a asistencia veterinaria, pensionado, manutención y compra de alimento.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
        </div>
      ) : accounts.length > 0 ? (
        <div className="grid gap-8">
          {accounts.map((account, idx) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white p-8 rounded-[2.5rem] border border-brand-accent shadow-xl flex flex-col md:flex-row gap-8 items-start md:items-center relative overflow-hidden"
            >
              <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center shrink-0">
                <CreditCard className="w-8 h-8" />
              </div>
              
              <div className="flex-1 space-y-2">
                <h3 className="text-2xl font-serif font-bold text-brand-primary">{account.title}</h3>
                {account.description && <p className="text-gray-500 text-sm leading-relaxed">{account.description}</p>}
                
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-brand-bg rounded-2xl border border-brand-accent">
                    <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">Entidad</span>
                    <span className="text-lg font-bold text-brand-dark">{account.bank_name}</span>
                  </div>
                  
                  {(account.alias || account.cbu || account.cvu) && (
                    <div className="p-4 bg-brand-bg rounded-2xl border border-brand-accent relative group">
                      <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">
                        {account.alias ? 'Alias' : account.cbu ? 'CBU' : 'CVU'}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-mono font-bold text-brand-dark truncate">
                          {account.alias || account.cbu || account.cvu}
                        </span>
                        <button 
                          onClick={() => copyToClipboard(account.alias || account.cbu || account.cvu || '', account.id)}
                          className="p-2 hover:bg-brand-accent rounded-lg transition-colors text-brand-primary"
                        >
                          {copiedId === account.id ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-brand-bg rounded-3xl border-2 border-dashed border-brand-accent">
          <Info className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No hay cuentas de colaboración publicadas por el momento.</p>
        </div>
      )}

      <footer className="mt-20 text-center p-8 bg-brand-primary/5 rounded-[2.5rem] border border-brand-accent">
        <p className="text-sm text-gray-500 font-medium italic">
          "Pequeñas acciones generan grandes cambios. Gracias por ser parte de la red de Sigo tu Huella."
        </p>
      </footer>
    </div>
  );
}
