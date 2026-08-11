// Build de Google Play (solo usuario final): se activa con VITE_PLAY_BUILD=true
// Vite reemplaza import.meta.env en build-time, así que esto queda como constante estática.
export const IS_PLAY_BUILD = import.meta.env.VITE_PLAY_BUILD === 'true';