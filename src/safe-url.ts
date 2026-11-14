export function safeUrl(value: string) {
  const parsed = new URL(value);
  return `${parsed.origin}${parsed.pathname}`;
}
