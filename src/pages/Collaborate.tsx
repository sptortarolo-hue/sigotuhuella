import React, { useState, useEffect } from 'react';
import { getCollaborationAccounts, CollaborationAccount } from '@/src/lib/collaborationService';
import { CreditCard, Copy, Check, Loader2, Heart, Info, ExternalLink, ShieldCheck } from 'lucide-react';
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

  const hasMp = accounts.some(a => a.mercadopago_link);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
      <header className="text-center mb-16">
        <div className="inline-flex p-3 bg-red-100 text-red-600 rounded-2xl mb-6">
          <Heart className="w-8 h-8 fill-current" />
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-6 tracking-tight">Colaborar con el rescate</h1>
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
              className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-brand-accent shadow-xl flex flex-col gap-6 relative overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center shrink-0">
                  <CreditCard className="w-8 h-8" />
                </div>

                <div className="flex-1 space-y-2 w-full">
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
                          <span className="text-lg font-mono font-bold text-brand-dark break-all">
                            {account.alias || account.cbu || account.cvu}
                          </span>
                          <button
                            onClick={() => copyToClipboard(account.alias || account.cbu || account.cvu || '', account.id)}
                            className="p-2 hover:bg-brand-accent rounded-lg transition-colors text-brand-primary shrink-0"
                          >
                            {copiedId === account.id ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mercado Pago Link */}
              {account.mercadopago_link && (
                <div className="border-t border-brand-accent pt-6">
                  <a
                    href={account.mercadopago_link}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    style={{ backgroundColor: '#009EE3', color: '#fff' }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                    Donar con Mercado Pago
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-brand-bg rounded-3xl border-2 border-dashed border-brand-accent">
          <Info className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No hay cuentas de colaboración publicadas por el momento.</p>
        </div>
      )}

      {hasMp && (
        <div className="mt-8 p-4 sm:p-6 bg-blue-50 rounded-[2rem] border border-blue-200 flex items-start gap-4">
          <ShieldCheck className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800 mb-1">Pagos 100% seguros</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Los pagos se procesan a través de Mercado Pago. No almacenamos ni manejamos datos de tarjetas. Podés donar con tarjeta de crédito, débito o saldo de Mercado Pago.
            </p>
          </div>
        </div>
      )}

      <footer className="mt-12 sm:mt-20 text-center p-8 bg-brand-primary/5 rounded-[2.5rem] border border-brand-accent">
        <p className="text-sm text-gray-500 font-medium italic">
          "Pequeñas acciones generan grandes cambios. Gracias por ser parte de la red de Sigo tu Huella."
        </p>
      </footer>
    </div>
  );
}
