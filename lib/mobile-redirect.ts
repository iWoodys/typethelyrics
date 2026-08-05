const MAIN_SITE_HOSTNAMES = new Set([
  "typethelyrics.sbs",
  "www.typethelyrics.sbs",
]);

const MOBILE_BROWSER_PATTERN =
  /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile Safari|Silk/i;
const AUTOMATED_CLIENT_PATTERN =
  /bot|crawler|spider|slurp|facebookexternalhit|whatsapp/i;

function normalizeHostname(hostname: string) {
  return hostname
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function shouldRedirectToMobileSite(
  hostname: string,
  userAgent: string,
  mobileClientHint = "",
) {
  if (!MAIN_SITE_HOSTNAMES.has(normalizeHostname(hostname))) return false;
  if (AUTOMATED_CLIENT_PATTERN.test(userAgent)) return false;
  return mobileClientHint.trim() === "?1" || MOBILE_BROWSER_PATTERN.test(userAgent);
}
