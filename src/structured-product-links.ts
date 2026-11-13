export type StructuredProductLink = { href: string; context: string };

/** Extract only product-context URLs; organization/site URLs are ignored. */
export function structuredProductLinks(jsonTexts: string[]): StructuredProductLink[] {
  const urls: string[] = [];
  for (const text of jsonTexts) {
    try {
      const value = JSON.parse(text) as unknown;
      const visit = (item: unknown, depth = 0, productContext = false) => {
        if (depth > 5 || item === null || typeof item !== "object") return;
        if (Array.isArray(item)) { item.slice(0, 50).forEach((entry) => visit(entry, depth + 1, productContext)); return; }
        const object = item as Record<string, unknown>;
        const type = typeof object["@type"] === "string" ? object["@type"] : "";
        const nextContext = productContext || /product|itemlist|listitem/i.test(type);
        for (const [key, child] of Object.entries(object)) {
          if (key === "url" && typeof child === "string" && nextContext) urls.push(child);
          else visit(child, depth + 1, nextContext);
        }
      };
      visit(value);
    } catch { /* malformed JSON-LD is ignored */ }
  }
  return [...new Set(urls)].slice(0, 40).map((href) => ({ href, context: "구조화된 상품 데이터" }));
}
