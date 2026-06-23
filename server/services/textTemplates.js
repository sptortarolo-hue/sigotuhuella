export function generateCelebrationText(pet, type) {
  const name = pet.name || 'una mascota';
  const species = pet.species === 'dog' ? 'perro' : pet.species === 'cat' ? 'gato' : 'mascota';
  const location = pet.location || 'nuestra zona';
  const isFemale = pet.gender === 'female';

  if (type === 'reunited') {
    const action = isFemale ? 'reencontrada' : 'reencontrado';
    const lostAction = isFemale ? 'perdida' : 'perdido';
    const messages = [
      `¡Qué alegría! 🎉 ${name} ya está de vuelta en casa. Este ${species} que buscábamos en ${location} fue ${action} con su familia. ¡Gracias a toda la comunidad que difundió y ayudó! Juntos hacemos la diferencia. 🐾💚`,
      `¡Final feliz! 🥳 ${name}, el ${species} que estaba ${lostAction} en ${location}, ya se reencontró con su familia. Gracias a la red de vecinos que compartieron su publicación. ¡Sigo Tu Huella sigue sumando reencuentros! 🐾❤️`,
      `¡Buenas noticias! ✨ ¡${name} apareció! Este ${species} que buscábamos en ${location} ya está con los suyos. La comunidad de Sicardi/Garibaldi una vez más demostró su solidaridad. 🙌🐾`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (type === 'adopted') {
    const action = isFemale ? 'adoptada' : 'adoptado';
    const messages = [
      `¡Nuevo hogar! 🏡 ${name} encontró una familia. Este ${species} fue ${action} y ahora tiene un hogar lleno de amor. ¡Gracias a todos los que compartieron y ayudaron a difundir! 🐾💚`,
      `¡Feliz adopción! 🎊 ${name} ya tiene familia. Después de esperar, este ${species} fue ${action}. Deseamos que sea muy feliz en su nuevo hogar. ¡Sigo Tu Huella celebra! 🐾❤️`,
      `¡Un final feliz más! 🌟 ${name} fue ${action}. Este ${species} encontró un hogar lleno de amor. Gracias a la red de adopción por hacer esto posible. 🐾💕`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  return '';
}
