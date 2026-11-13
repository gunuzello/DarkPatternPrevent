const amount = String.raw`([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)\s*원`;
// Option controls vary by storefront. Keep the amount shape strict, but allow
// arbitrary option wording when the surcharge is explicitly marked with '+'.
const optionPrice = new RegExp(String.raw`^.+?\s*(?:\(\s*\+\s*${amount}\s*\)|\+\s*${amount})$`);
const mandatoryFee = new RegExp(String.raw`^필수\s*(처리비|포장비|서비스비|수수료)\s*[:：]?\s*${amount}$`);
const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

export function isVariantOptionLabel(label: string) {
  return /(?:사이즈|색상|컬러|용량|중량|구성)/i.test(normalize(label));
}

function won(value: string) {
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function paidOptionFromText(label: string) {
  const normalized = normalize(label);
  // Variant prices (size/color/volume) are product-price differences, not
  // ancillary services that can be treated as a preselected dark pattern.
  if (isVariantOptionLabel(normalized)) return null;
  const match = optionPrice.exec(normalized);
  return match ? won(match[1] ?? match[2]) : null;
}

export function mandatoryFeeFromText(label: string) {
  const match = mandatoryFee.exec(normalize(label));
  if (!match) return null;
  const amount = won(match[2]);
  return amount === null ? null : { key: match[1], won: amount };
}

export function feeMentionsFromText(text: string) {
  const pattern = new RegExp(String.raw`(?:필수\s*)?(처리비|포장비|서비스비|수수료)\s*[:：]?\s*${amount}`, "g");
  return [...normalize(text).matchAll(pattern)].flatMap((match) => {
    const amount = won(match[2]);
    return amount === null ? [] : [{ key: match[1], won: amount }];
  });
}
