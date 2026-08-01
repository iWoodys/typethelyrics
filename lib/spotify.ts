import SpotifyWebApi from 'spotify-web-api-node';

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

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
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    return data.body['access_token'];
  } catch (error) {
    console.error('Error getting Spotify access token:', error);
    throw error;
  }
};

export const getLyrics = async (trackId: string, format: 'lrc' | 'srt' = 'lrc') => {
  try {
    await getAccessToken();
    const track = await spotifyApi.getTrack(trackId);

    const artist = track.body.artists.map(item => item.name).join(', ');
    const params = new URLSearchParams({
      track_name: track.body.name,
      artist_name: artist,
      album_name: track.body.album.name,
      duration: Math.round(track.body.duration_ms / 1000).toString(),
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
      track_name: track.body.name,
      track_artist: artist,
      track_album: track.body.album.name,
      track_duration: formatDuration(track.body.duration_ms),
      track_duration_ms: track.body.duration_ms,
      album_image: track.body.album.images[0]?.url,
    };

    const syncedLines = parseSyncedLyrics(data.syncedLyrics || '');
    const syncType = syncedLines.length ? 'SYNCED' : 'UNSYNCED';
    let lyrics: string;

    if (format === 'srt' && syncedLines.length) {
      lyrics = syncedLines.map((line, index) => {
        const end = syncedLines[index + 1]?.timeMs ?? Math.min(line.timeMs + 5000, track.body.duration_ms);
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
      trackDetails
    };
  } catch (error) {
    console.error('Error getting lyrics:', error);
    throw error;
  }
};

export const searchTracks = async (query: string) => {
  await getAccessToken();
  const result = await spotifyApi.searchTracks(query, { limit: 8 });
  return (result.body.tracks?.items || []).map(track => ({
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
  await getAccessToken();
  const results = await Promise.allSettled(ids.map(id => spotifyApi.getTrack(id)));
  return results.flatMap(result => result.status === 'fulfilled' ? [{
    id: result.value.body.id,
    title: result.value.body.name,
    artist: result.value.body.artists.map(artist => artist.name).join(', '),
    image: result.value.body.album.images[0]?.url || null,
  }] : []);
};

export const getPlaylistTracks = async (playlistId: string) => {
  await getAccessToken();
  const result = await spotifyApi.getPlaylistTracks(playlistId, { limit: 50 });
  return result.body.items.flatMap(item => {
    const track = item.track;
    if (!track || !('album' in track)) return [];
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
