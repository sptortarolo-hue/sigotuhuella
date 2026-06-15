const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '1224768922970900';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'https://sigotuhuella.online';

function getFBShareUrl(pet) {
  const petUrl = `${FRONTEND_URL}/pet/${pet.id}`;
  const quote = [
    pet.status === 'lost' ? '🐾 PERDIDO' :
    pet.status === 'for_adoption' ? '❤️ EN ADOPCIÓN' :
    pet.status === 'sighted' ? '👀 AVISTADO' :
    pet.status === 'reunited' ? '🎉 REENCUENTRO' : '🐾 MASCOTA',
    `${pet.name || (pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Mascota')}`,
    `📍 ${pet.location || ''}`,
    '',
    `🔗 ${petUrl}`,
  ].filter(Boolean).join('\n');

  return `https://www.facebook.com/dialog/share?app_id=${FB_APP_ID}&display=popup&href=${encodeURIComponent(petUrl)}&quote=${encodeURIComponent(quote)}&redirect_uri=${encodeURIComponent(petUrl)}`;
}

export function shareOnFacebook(pet) {
  window.open(getFBShareUrl(pet), '_blank', 'width=600,height=500');
}

export function getFacebookShareText(pet) {
  const statusLabels = {
    lost: '🐾 PERDIDO',
    retained: '🔄 RETENIDO',
    sighted: '👀 AVISTADO',
    for_adoption: '❤️ EN ADOPCIÓN',
    adopted: '✅ ADOPTADO',
    reunited: '🎉 REENCUENTRO',
    accidented: '🚑 ACCIDENTADO',
    needs_attention: '⚠️ NECESITA ATENCIÓN',
  };
  const speciesLabels = { dog: 'Perro', cat: 'Gato', other: 'Mascota' };
  const statusTag = statusLabels[pet.status] || '🐾 MASCOTA';
  const species = speciesLabels[pet.species] || 'Mascota';
  const petUrl = `${FRONTEND_URL}/pet/${pet.id}`;

  return [
    `${statusTag}`,
    `${pet.name ? 'Nombre: ' + pet.name : species}`,
    pet.location ? `📍 ${pet.location}` : '',
    pet.contact_info ? `📞 ${pet.contact_info}` : '',
    '',
    pet.description ? pet.description.substring(0, 300) : '',
    '',
    `🔗 ${petUrl}`,
  ].filter(Boolean).join('\n');
}
