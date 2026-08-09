import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

export const ARG_PHONE = /^549\d{10}$/;

export type PhoneCheck = {
  ok: boolean;
  partial: boolean;
  invalid: boolean;
  message: string;
  formatted: string;
  e164: string;
};

function digits(raw: string): string {
  const at = raw.indexOf('@');
  const slice = at >= 0 ? raw.slice(0, at) : raw;
  return slice.replace(/[^\d]/g, '');
}

export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = digits(raw);
  if (!d) return null;
  if (ARG_PHONE.test(d)) return d;

  const rawClean = (raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw).trim();
  const parsed = parsePhoneNumberFromString(rawClean, 'AR');

  if (parsed) {
    const e164 = parsed.number ? digits(parsed.number) : '';
    if (ARG_PHONE.test(e164)) return e164;
  }

  let n = d.startsWith('00') ? d.slice(2) : d;
  if (n.startsWith('0')) n = n.slice(1);
  if (n.length === 10) n = '549' + n;
  if (!ARG_PHONE.test(n)) return null;
  return n;
}

export function checkArgPhone(raw: string): PhoneCheck {
  const d = digits(raw);
  if (!d) {
    return { ok: false, partial: true, invalid: false, message: '', formatted: '', e164: '' };
  }
  const e164 = toE164(raw);
  if (e164) {
    const p = parsePhoneNumberFromString('+' + e164);
    const isMobile = !!p && (p.getType() === 'MOBILE' || !p.getType());
    if (isMobile) {
      return { ok: true, partial: false, invalid: false, message: '', formatted: p ? p.formatInternational() : e164, e164 };
    }
    return { ok: false, partial: false, invalid: true, message: 'Solo se aceptan celulares (WhatsApp)', formatted: '', e164: '' };
  }
  if (d.length < 10) {
    return { ok: false, partial: true, invalid: false, message: '', formatted: '', e164: '' };
  }
  return { ok: false, partial: false, invalid: true, message: 'Formato: 549XXXXXXXXXX (13 dígitos)', formatted: '', e164: '' };
}