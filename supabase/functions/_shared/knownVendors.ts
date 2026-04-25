// MIRROR of src/lib/knownVendors.ts — keep in sync.
// Edge functions can't import from src/, so this file is duplicated.

export const KNOWN_COGS_VENDORS = [
  "Anthropic",
  "Azure",
  "OpenAI",
  "ElevenLabs",
  "Deepgram",
  "Pump",
  "Twilio",
  "Sequoia One",
  "Deel",
] as const;

export const isKnownCogsVendor = (vendor: string): boolean => {
  const v = vendor.toLowerCase();
  return KNOWN_COGS_VENDORS.some((k) => v.includes(k.toLowerCase()));
};

export const matchesAnyRule = (
  vendor: string,
  rules: { vendor_contains: string }[],
): boolean => {
  const v = vendor.toLowerCase();
  return rules.some((r) => v.includes(r.vendor_contains.toLowerCase()));
};
