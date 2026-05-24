import { Pet, PetStatus } from './petService';

function getSpeciesLabel(species: string): string {
  if (species === 'dog') return 'perro';
  if (species === 'cat') return 'gato';
  return 'mascota';
}

function getWhatsAppShareText(pet: Pet): string {
  const species = getSpeciesLabel(pet.species);
  const name = pet.name || species;
  const location = pet.location || 'una zona del barrio';
  const link = `https://sigotuhuella.online/pet/${pet.id}`;
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
    case PetStatus.ADOPTED:
      body = `🐾 ${name} encontró familia. Gracias a todos los que difundieron 💚`;
      break;
    case PetStatus.REUNITED:
      body = `🐾 ${name} se reencontró con su familia. Gracias por difundir 💚`;
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
