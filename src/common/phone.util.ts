export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Converts a Bangladeshi local-format number (leading 0, 11 digits, e.g. "01969489525")
// to the international digits-only form WhatsApp sends ("8801969489525"), so numbers typed
// in local format in config can be compared against the webhook's `from` field.
export function toInternationalBD(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11 && digits.startsWith('0')) {
    return `880${digits.slice(1)}`;
  }
  return digits;
}
