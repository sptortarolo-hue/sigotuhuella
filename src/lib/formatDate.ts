const AR_TZ = 'America/Argentina/Buenos_Aires';

export function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString('es-AR', { timeZone: AR_TZ });
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('es-AR', { timeZone: AR_TZ });
}

export function formatDateShort(date: string | Date) {
  return new Date(date).toLocaleDateString('es-AR', {
    timeZone: AR_TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
