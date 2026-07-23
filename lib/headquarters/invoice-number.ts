export const qualifiedInvoiceIssuerNumberPattern = /^T\d{13}$/;

export function normalizeQualifiedInvoiceIssuerNumber(
  value: string | null | undefined
) {
  return String(value || "").trim();
}

export function isValidQualifiedInvoiceIssuerNumber(
  value: string | null | undefined
) {
  const normalized = normalizeQualifiedInvoiceIssuerNumber(value);
  return normalized === "" || qualifiedInvoiceIssuerNumberPattern.test(normalized);
}

