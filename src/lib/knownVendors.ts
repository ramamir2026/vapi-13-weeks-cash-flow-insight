// Hardcoded COGS vendor names — case-insensitive substring match.
// Used by the one-time payment alert to suppress flags for known vendors.
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

/**
 * Returns true if the vendor matches any known COGS vendor name
 * (case-insensitive substring match).
 */
export const isKnownCogsVendor = (vendor: string): boolean => {
  const v = vendor.toLowerCase();
  return KNOWN_COGS_VENDORS.some((k) => v.includes(k.toLowerCase()));
};

/**
 * Returns true if the vendor matches any user-defined bank_category_rules entry.
 */
export const matchesAnyRule = (
  vendor: string,
  rules: { vendor_contains: string }[]
): boolean => {
  const v = vendor.toLowerCase();
  return rules.some((r) => v.includes(r.vendor_contains.toLowerCase()));
};
