import { Pet, PetStatus } from './petService';

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'https://www.sigotuhuella.com.ar';

function getSpeciesLabel(species: string): string {
  if (species === 'dog') return 'perro';
  if (species === 'cat') return 'gato';
  return 'mascota';
}

function getWhatsAppShareText(pet: Pet): string {
  const species = getSpeciesLabel(pet.species);
  const name = pet.name || 'una mascota';
  const location = pet.location || 'una zona del barrio';
  const link = `${import.meta.env.VITE_FRONTEND_URL || 'https://www.sigotuhuella.com.ar'}/pet/${pet.id}`;
  let body: string;

  switch (pet.status) {
    case PetStatus.LOST:
      body = `🐾 Se perdió ${pet.name ? `a ${pet.name}` : `un ${species}`} en ${location}. Ayudanos a difundir 🙏`;
      break;
    case PetStatus.RETAINED:
      body = `🐾 Se retuvo un ${species} en ${location}. Buscamos a su familia 🙏`;
      break;
    case PetStatus.SIGHTED:
      body = `🐾 Se avistó un ${species} en ${location}. Ayudanos a difundir 🙏`;
      break;
    case PetStatus.ACCIDENTED:
      body = `🐾 Se accidentó un ${species} en ${location}. Necesitamos ayuda 🙏`;
      break;
    case PetStatus.NEEDS_ATTENTION:
      body = `🐾 ${name} en ${location} necesita atención. Ayudanos a difundir 🙏`;
      break;
    case PetStatus.FOR_ADOPTION:
      body = `🐾 ${name} busca un hogar amoroso en ${location}. Dale una chance 🙏`;
      break;
    case PetStatus.FOR_ADOPTION_SIMPLE:
      body = `🐾 ${name} busca un hogar amoroso en ${location}. Sólo difusión 🙏`;
      break;
    case PetStatus.ADOPTED:
      body = `🐾 ${name} encontró familia. Gracias a todos los que difundieron 💚`;
      break;
    case PetStatus.REUNITED:
      body = `🐾 ${name} se reencontró con su familia. Gracias por difundir 💚`;
      break;
    case PetStatus.TRANSITADA:
      body = `🐾 ${name} está en tránsito en ${location} mientras espera un hogar definitivo 🙏`;
      break;
    default:
      body = `🐾 ${name} en ${location} — Más información en Sigo Tu Huella`;
  }

  return `${body}\n\n${link}`;
}

export function shareOnWhatsApp(pet: Pet): void {
  const text = getWhatsAppShareText(pet);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

export async function shareRaffleOnWhatsApp(raffleId: string, title: string): Promise<void> {
  const link = `${FRONTEND_URL}/rifas/${raffleId}`;
  const text = `🎟️ ¡${title}!\n\nComprá tu número en ${link}`;
  const flyerUrl = `${FRONTEND_URL}/api/raffles/${raffleId}/flyer`;

  if (navigator.share) {
    try {
      const resp = await fetch(flyerUrl);
      const blob = await resp.blob();
      const file = new File([blob], `rifa-${title}.png`, { type: 'image/png' });
      await navigator.share({ title: `Rifa: ${title}`, text, files: [file] });
      return;
    } catch {
      // fallback si falla la descarga o el share
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
