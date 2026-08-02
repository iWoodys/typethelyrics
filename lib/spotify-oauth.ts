const PRODUCTION_ORIGIN = "https://typethelyrics.sbs";

export function spotifyOAuthUrls(requestUrl: string) {
  const requestOrigin = new URL(requestUrl).origin;
  const appOrigin = process.env.NODE_ENV === "production"
    ? PRODUCTION_ORIGIN
    : requestOrigin;

  return {
    appOrigin,
    redirectUri: `${appOrigin}/api/spotify/callback`,
  };
}
