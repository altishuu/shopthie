export type CurrencySettings = {
  currency: string;
  locale: string;
  symbolOverride?: string;
};

/** One settings adapter; a future dashboard can supply these values. No FX conversion. */
export const currencySettings: Readonly<CurrencySettings> = {
  currency: "USD",
  locale: "en-US",
};

/** Prices must already be denominated in the configured currency's minor units. */
export function formatMoney(
  amountMinor: number,
  settings: CurrencySettings = currencySettings,
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Money must be a safe integer expressed in minor units");
  }
  const formatter = new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = amountMinor / 10 ** digits;
  if (!settings.symbolOverride) return formatter.format(amount);
  return formatter
    .formatToParts(amount)
    .map((part) => (part.type === "currency" ? settings.symbolOverride : part.value))
    .join("");
}
