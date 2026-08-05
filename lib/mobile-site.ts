export const MOBILE_SITE_HOSTNAME = "m.typethelyrics.sbs";

const normalizeHostname = (hostname: string) =>
  hostname.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");

export function isMobileSiteHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return normalized === MOBILE_SITE_HOSTNAME || normalized === "m.localhost";
}

export function isMobileSiteLocation(
  hostname: string,
  search = "",
  viewportWidth?: number,
) {
  if (isMobileSiteHostname(hostname)) return true;
  if (new URLSearchParams(search).get("mobile") === "1") return true;
  return typeof viewportWidth === "number" && viewportWidth <= 767;
}
