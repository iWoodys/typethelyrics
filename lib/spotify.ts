type SpotifyImage = { url: string };
type SpotifyArtist = { name: string };
type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: { name: string; images: SpotifyImage[] };
};

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

const spotifyFetch = async <T>(path: string): Promise<T> => {
  const token = await getAccessToken();
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Spotify respondió con estado ${response.status}.`);
  return response.json() as Promise<T>;
};

export const getLyrics = async (trackId: string, format: 'lrc' | 'srt' = 'lrc') => {
  try {
    const track = await spotifyFetch<SpotifyTrack>(`/tracks/${encodeURIComponent(trackId)}`);

    const artist = track.artists.map(item => item.name).join(', ');
    const params = new URLSearchParams({
      track_name: track.name,
      artist_name: artist,
      album_name: track.album.name,
      duration: Math.round(track.duration_ms / 1000).toString(),
    });
    const response = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: {
        'Lrclib-Client': 'TypeTheLyrics/0.1.0 (https://github.com/ArjunCodess/typethelyrics)',
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      throw new Error('No lyrics found');
    }

    const data: { plainLyrics: string | null; syncedLyrics: string | null; instrumental: boolean } = await response.json();
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
  const ids = [...new Set(trackIds)].filter(Boolean).slice(0, 50);
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

export const getPlaylistTracks = async (playlistId: string) => {
  const result = await spotifyFetch<{ items: Array<{ track: SpotifyTrack | null }> }>(
    `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50`,
  );
  return result.items.flatMap(item => {
    const track = item.track;
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
