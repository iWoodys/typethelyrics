export type SpotifyPremiumStatus =
  | "disconnected"
  | "free"
  | "premium";

export type SpotifySessionPayload = {
  connected?: boolean;
  premium?: boolean | null;
  requiresReconnect?: boolean;
};

export function classifySpotifyPremiumSession(
  payload: SpotifySessionPayload,
): SpotifyPremiumStatus {
  if (payload.requiresReconnect || !payload.connected) return "disconnected";
  // Spotify puede omitir el plan en Development Mode. El Web Playback SDK
  // valida ese caso de forma definitiva con su evento `account_error`.
  return payload.premium === false ? "free" : "premium";
}
