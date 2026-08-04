export interface LyricsResponse {
  lyrics: string;
  syncType: string;
  syncedLyrics: { startTimeMs: number; words: string; }[];
  originalSyncedLyrics?: { startTimeMs: number; words: string; }[];
  lyricsOrigin?: "LRCLIB" | "community";
  trackDetails: TrackDetails;
  lyricsSource?: {
    provider: "LRCLIB";
    id: number;
    duration: number;
  };
  syncAdjustment?: {
    confidence: "exact" | "high" | "medium";
    durationDeltaMs: number;
    suggestedTimeScale: number;
  };
}

export interface TrackDetails {
  track_name: string;
  track_artist: string;
  track_album: string;
  track_duration: string;
  track_duration_ms?: number;
  album_image?: string;
}

export interface SyncedLyric {
  startTimeMs: number;
  words: string;
}
