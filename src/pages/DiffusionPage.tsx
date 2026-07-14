import { useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import { Printer, FileDown } from 'lucide-react';

export default function DiffusionPage() {
  const [generating, setGenerating] = useState(false);
  const flyerRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    const element = flyerRef.current;
    if (!element) return;
    setGenerating(true);
    try {
      await html2pdf()
        .set({
          margin: 0,
          filename: 'sigo-tu-huella-difusion.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 3, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save();
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <style>{`
        @media screen {
          .print-flyer { display: none !important; }
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          #root { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-flyer {
            display: flex !important;
            position: fixed !important;
            inset: 0 !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .print-flyer img { width: 100%; height: 100%; object-fit: contain; }
        }
      `}</style>

      {/* Screen UI */}
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Difusión</h1>
            <p className="text-gray-500 mt-2 text-sm">Descargá e imprimí el flyer para pegar en veterinarias, plazas y comercios.</p>
          </div>

          {/* Flyer preview */}
          <div ref={flyerRef} className="rounded-2xl overflow-hidden shadow-lg border border-brand-accent mb-6">
            <img
              src="/difusion.jpeg"
              alt="Flyer Sigo Tu Huella"
              className="w-full h-auto block"
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleDownloadPdf}
              disabled={generating}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {generating ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generando PDF...
                </>
              ) : (
                <>
                  <FileDown className="w-5 h-5" /> Descargar PDF
                </>
              )}
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

      {/* Print-only flyer */}
      <div className="print-flyer">
        <img src="/difusion.jpeg" alt="Flyer Sigo Tu Huella" />
      </div>
    </>
  );
}
