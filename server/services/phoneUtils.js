export function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (/^549\d{7,}$/.test(cleaned)) return cleaned;
  if (/^54\d{7,}$/.test(cleaned))
    cleaned = '549' + cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  cleaned = cleaned.replace(/^(\d{2,4})15(\d{4,})$/, '$1$2');
  return '549' + cleaned;
}
