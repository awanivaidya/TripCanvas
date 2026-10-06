// A small country -> currency lookup. Real apps often use a library or a big JSON file for
// this; a plain object covering common countries keeps things simple and is easy to extend.
// (ISO 4217 currency codes: https://en.wikipedia.org/wiki/ISO_4217)
export const COUNTRY_CURRENCY: Record<string, { code: string; symbol: string }> = {
  US: { code: "USD", symbol: "$" },
  IN: { code: "INR", symbol: "₹" },
  GB: { code: "GBP", symbol: "£" },
  JP: { code: "JPY", symbol: "¥" },
  CN: { code: "CNY", symbol: "¥" },
  AU: { code: "AUD", symbol: "A$" },
  CA: { code: "CAD", symbol: "C$" },
  SG: { code: "SGD", symbol: "S$" },
  AE: { code: "AED", symbol: "AED" },
  DE: { code: "EUR", symbol: "€" },
  FR: { code: "EUR", symbol: "€" },
  ES: { code: "EUR", symbol: "€" },
  IT: { code: "EUR", symbol: "€" },
  NL: { code: "EUR", symbol: "€" },
  BR: { code: "BRL", symbol: "R$" },
  MX: { code: "MXN", symbol: "MX$" },
  ZA: { code: "ZAR", symbol: "R" },
  KR: { code: "KRW", symbol: "₩" },
  TH: { code: "THB", symbol: "฿" },
  ID: { code: "IDR", symbol: "Rp" },
  PH: { code: "PHP", symbol: "₱" },
  NZ: { code: "NZD", symbol: "NZ$" },
};

const DEFAULT_CURRENCY = { code: "USD", symbol: "$" };

// Every currency in the table once (several countries share EUR), for the currency dropdown.
export const CURRENCIES = [...new Map(Object.values(COUNTRY_CURRENCY).map((c) => [c.code, c])).values()];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

// "INR" -> { code: "INR", symbol: "₹" }
export function currencyForCode(code: string | null | undefined) {
  return CURRENCIES.find((c) => c.code === code) ?? DEFAULT_CURRENCY;
}

export function currencyForCountry(countryCode: string | null | undefined) {
  if (!countryCode) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? DEFAULT_CURRENCY;
}
