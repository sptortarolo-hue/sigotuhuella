import { Printer, FileDown } from 'lucide-react';

export default function DiffusionPage() {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = '/difusion.jpeg';
    a.download = 'sigo-tu-huella-difusion.jpeg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    const w = window.open('/difusion.jpeg', '_blank');
    if (w) {
      w.onload = () => w.print();
    }
  };

  return (
    <>
      <style>{`
        @media print {
          body > *:not(.print-flyer) { display: none !important; }
          .print-flyer { display: block !important; }
          .print-flyer img { width: 100vw; height: 100vh; object-fit: contain; }
        }
      `}</style>

      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Difusión</h1>
            <p className="text-gray-500 mt-2 text-sm">Descargá e imprimí el flyer para pegar en veterinarias, plazas y comercios.</p>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-lg border border-brand-accent mb-6">
            <img src="/difusion.jpeg" alt="Flyer Sigo Tu Huella" className="w-full h-auto block" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all"
            >
              <FileDown className="w-5 h-5" /> Descargar
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 px-8 py-3.5 border-2 border-brand-primary text-brand-primary rounded-xl font-bold hover:bg-brand-primary/5 transition-all"
            >
              <Printer className="w-5 h-5" /> Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="print-flyer hidden">
        <img src="/difusion.jpeg" alt="Flyer Sigo Tu Huella" />
      </div>
    </>
  );
}
