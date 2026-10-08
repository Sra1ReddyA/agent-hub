/** A small, dependency-free "shields"-style SVG badge. Pure string building, with every dynamic value XML-escaped
 * (the label/value come from our own code, but the function is safe for any input regardless). */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function colorForScore(total: number | null): string {
  if (total === null) return "#9f9f9f";
  if (total >= 85) return "#2ea44f";
  if (total >= 65) return "#97ca00";
  if (total >= 40) return "#dfb317";
  return "#e05d44";
}

// ~6.4px per character at 11px Verdana, plus padding — close enough that text never clips.
const textWidth = (s: string) => Math.ceil(s.length * 6.4);

export function badgeSvg(label: string, value: string, color: string): string {
  const l = esc(label);
  const v = esc(value);
  const lw = textWidth(label) + 12;
  const vw = textWidth(value) + 12;
  const w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${v}"><title>${l}: ${v}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${esc(color)}"/><rect width="${w}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${l}</text><text x="${lw / 2}" y="14">${l}</text><text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${v}</text><text x="${lw + vw / 2}" y="14">${v}</text></g></svg>`;
}
