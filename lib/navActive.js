// Overview links must match exactly, otherwise they would look active on every sub page.
const EXACT_ONLY = ["/", "/dashboard", "/collector", "/business", "/admin"];

export function isActive(pathname, href) {
  if (!pathname || !href) return false;
  if (EXACT_ONLY.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
