type SpotifyImage = { url: string };
type SpotifyArtist = { name: string };
type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: { name: string; images: SpotifyImage[] };
};

export type LrclibCandidate = {
  id: number;
  trackName?: string | null;
  artistName?: string | null;
  albumName?: string | null;
  duration: number;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  instrumental: boolean;
};

type LyricsMatch = {
  candidate: LrclibCandidate;
  confidence: "exact" | "high" | "medium";
  durationDeltaMs: number;
  suggestedTimeScale: number;
};

const EDITION_WORDS = new Set([
  "acoustic",
  "acustico",
  "edit",
  "extended",
  "instrumental",
  "live",
  "remaster",
  "remastered",
  "remix",
  "slowed",
  "sped",
  "version",
]);

const normalizeMetadata = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(normalizeMetadata(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeMetadata(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / new Set([...leftTokens, ...rightTokens]).size;
};

const editionMismatchCount = (left: string, right: string) => {
  const leftTokens = new Set(normalizeMetadata(left).split(" "));
  const rightTokens = new Set(normalizeMetadata(right).split(" "));
  return [...EDITION_WORDS].filter(
    (word) => leftTokens.has(word) !== rightTokens.has(word),
  ).length;
};

export function selectBestLyricsCandidate(
  candidates: LrclibCandidate[],
  track: Pick<SpotifyTrack, "name" | "duration_ms" | "artists" | "album">,
): LyricsMatch | null {
  const synced = candidates.filter((candidate) => Boolean(candidate.syncedLyrics?.trim()));
  if (!synced.length) return null;

  const artist = track.artists.map((item) => item.name).join(", ");
  const scored = synced.map((candidate) => {
    const durationDeltaMs = Math.abs(candidate.duration * 1000 - track.duration_ms);
    const titleExact = normalizeMetadata(candidate.trackName) === normalizeMetadata(track.name);
    const artistExact = normalizeMetadata(candidate.artistName) === normalizeMetadata(artist);
    const albumExact = normalizeMetadata(candidate.albumName) === normalizeMetadata(track.album.name);
    const durationScore = Math.max(-80, 55 - durationDeltaMs / 100);
    const score =
      60 +
      durationScore +
      (titleExact ? 45 : tokenSimilarity(candidate.trackName || "", track.name) * 30) +
      (artistExact ? 35 : tokenSimilarity(candidate.artistName || "", artist) * 25) +
      (albumExact ? 15 : tokenSimilarity(candidate.albumName || "", track.album.name) * 8) -
      editionMismatchCount(candidate.trackName || "", track.name) * 45;
    return { candidate, score, durationDeltaMs, titleExact, artistExact };
  });

  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  const ratio = track.duration_ms / Math.max(1, best.candidate.duration * 1000);
  const safeScale =
    best.titleExact &&
    best.artistExact &&
    best.durationDeltaMs >= 1_500 &&
    best.durationDeltaMs <= 6_000 &&
    ratio >= 0.985 &&
    ratio <= 1.015
      ? ratio
      : 1;
  const confidence =
    best.titleExact && best.artistExact && best.durationDeltaMs <= 1_200
      ? "exact"
      : best.titleExact && best.artistExact && best.durationDeltaMs <= 6_000
        ? "high"
        : "medium";

  return {
    candidate: best.candidate,
    confidence,
    durationDeltaMs: Math.round(best.durationDeltaMs),
    suggestedTimeScale: Math.round(safeScale * 1_000_000) / 1_000_000,
  };
}

let cachedToken = '';
let tokenExpiresAt = 0;

export const checkSpotifyUrl = (url: string): { type: string | null; id: string | null } => {
  const regex = /^(?:spotify:(track|album|playlist):|https?:\/\/(?:[a-z]+\.)?spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|playlist|album)\/)([a-zA-Z0-9]+)(?:[/?#]|$)/i;
  const match = url.match(regex);

  if (!match) {
    return { type: null, id: null };
  }

  return {
    type: match[2] || match[1],
    id: match[3],
  };
};

export const getAccessToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Spotify no está configurado.');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('No se pudo autenticar con Spotify.');
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, data.expires_in - 60) * 1000;
  return cachedToken;
};

const spotifyFetch = async <T>(path: string, userToken?: string): Promise<T> => {
  const token = userToken || await getAccessToken();
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(userToken ? { cache: 'no-store' as const } : { next: { revalidate: 300 } }),
  });
  if (!response.ok) throw new Error(`Spotify respondió con estado ${response.status}.`);
  return response.json() as Promise<T>;
};

export const getLyrics = async (trackId: string, format: 'lrc' | 'srt' = 'lrc') => {
  try {
    const track = await spotifyFetch<SpotifyTrack>(`/tracks/${encodeURIComponent(trackId)}`);

    const artist = track.artists.map(item => item.name).join(', ');
    const searchParams = new URLSearchParams({
      track_name: track.name,
      artist_name: artist,
    });
    const headers = {
      'Lrclib-Client': 'TypeTheLyrics/0.1.0 (https://github.com/iWoodys/typethelyrics)',
    };
    const searchResponse = await fetch(`https://lrclib.net/api/search?${searchParams}`, {
      headers,
      next: { revalidate: 86400 },
    });
    const candidates = searchResponse.ok
      ? await searchResponse.json() as LrclibCandidate[]
      : [];
    let match = selectBestLyricsCandidate(candidates, track);

    if (!match) {
      const exactParams = new URLSearchParams({
        track_name: track.name,
        artist_name: artist,
        album_name: track.album.name,
        duration: Math.round(track.duration_ms / 1000).toString(),
      });
      const response = await fetch(`https://lrclib.net/api/get?${exactParams}`, {
        headers,
        next: { revalidate: 86400 },
      });
      if (response.ok) {
        const exact = await response.json() as LrclibCandidate;
        match = selectBestLyricsCandidate([exact], track);
      }
    }

    if (!match) {
      throw new Error('No lyrics found');
    }

    const data = match.candidate;
    const trackDetails = {
      track_name: track.name,
      track_artist: artist,
      track_album: track.album.name,
      track_duration: formatDuration(track.duration_ms),
      track_duration_ms: track.duration_ms,
      album_image: track.album.images[0]?.url,
    };

    const syncedLines = parseSyncedLyrics(data.syncedLyrics || '');
    const syncType = syncedLines.length ? 'SYNCED' : 'UNSYNCED';
    let lyrics: string;

    if (format === 'srt' && syncedLines.length) {
      lyrics = syncedLines.map((line, index) => {
        const end = syncedLines[index + 1]?.timeMs ?? Math.min(line.timeMs + 5000, track.duration_ms);
        return `${index + 1}\n${formatSrtTime(line.timeMs)} --> ${formatSrtTime(end)}\n${line.words}`;
      }).join('\n\n');
    } else if (syncedLines.length) {
      lyrics = data.syncedLyrics || '';
    } else {
      lyrics = data.plainLyrics || (data.instrumental ? '[Instrumental]' : '');
    }

    return {
      lyrics,
      syncType,
      trackDetails,
      syncedLyrics: syncedLines.map(line => ({ startTimeMs: line.timeMs, words: line.words })),
      lyricsSource: { provider: 'LRCLIB' as const, id: data.id, duration: data.duration },
      syncAdjustment: {
        confidence: match.confidence,
        durationDeltaMs: match.durationDeltaMs,
        suggestedTimeScale: match.suggestedTimeScale,
      },
    };
  } catch (error) {
    console.error('Error getting lyrics:', error);
    throw error;
  }
};

export const searchTracks = async (query: string) => {
  const result = await spotifyFetch<{ tracks?: { items: SpotifyTrack[] } }>(
    `/search?type=track&limit=8&q=${encodeURIComponent(query)}`,
  );
  return (result.tracks?.items || []).map(track => ({
    id: track.id,
    title: track.name,
    artist: track.artists.map(artist => artist.name).join(', '),
    album: track.album.name,
    image: track.album.images[0]?.url || '',
    url: `https://open.spotify.com/track/${track.id}`,
  }));
};

export const getTracksByIds = async (trackIds: string[]) => {
  const ids = [...new Set(trackIds)].filter(id => /^[A-Za-z0-9]{10,30}$/.test(id)).slice(0, 50);
  if (!ids.length) return [];
  const result = await spotifyFetch<{ tracks: Array<SpotifyTrack | null> }>(
    `/tracks?ids=${encodeURIComponent(ids.join(','))}`,
  );
  return result.tracks.filter((track): track is SpotifyTrack => Boolean(track)).map(track => ({
    id: track.id,
    title: track.name,
    artist: track.artists.map(artist => artist.name).join(', '),
    image: track.album.images[0]?.url || null,
  }));
};

export const getPlaylistTracks = async (playlistId: string, userToken: string) => {
  const items: Array<{ item?: SpotifyTrack | null; track?: SpotifyTrack | null }> = [];
  for (let offset = 0; offset < 1000; offset += 50) {
    const page = await spotifyFetch<{ items: Array<{ item?: SpotifyTrack | null; track?: SpotifyTrack | null }>; next?: string | null }>(
      `/playlists/${encodeURIComponent(playlistId)}/items?limit=50&offset=${offset}&market=AR`, userToken,
    );
    items.push(...page.items);
    if (!page.next || page.items.length < 50) break;
  }
  return items.flatMap(item => {
    const track = item.item || item.track;
    if (!track) return [];
    return [{ id: track.id, title: track.name, artist: track.artists.map(artist => artist.name).join(', '), album: track.album.name, image: track.album.images[0]?.url || '', url: `https://open.spotify.com/track/${track.id}` }];
  });
};

const parseSyncedLyrics = (lyrics: string) => lyrics
  .split('\n')
  .map(line => {
    const match = line.match(/^\[(\d{2}):(\d{2})[.:](\d{2,3})\]\s*(.*)$/);
    if (!match) return null;
    const fraction = match[3].length === 2 ? Number(match[3]) * 10 : Number(match[3]);
    return {
      timeMs: Number(match[1]) * 60000 + Number(match[2]) * 1000 + fraction,
      words: match[4].trim(),
    };
  })
  .filter((line): line is { timeMs: number; words: string } => line !== null && Boolean(line.words));

const formatSrtTime = (timeMs: number) => {
  const hours = Math.floor(timeMs / 3600000);
  const minutes = Math.floor((timeMs % 3600000) / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const milliseconds = timeMs % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
};

const formatDuration = (durationMs: number): string => {
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  const hundredths = Math.floor((durationMs % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}; 
