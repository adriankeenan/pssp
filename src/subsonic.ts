import { createHash, randomBytes } from 'node:crypto';
import type SubsonicAPI from 'subsonic-api';
import type { ArtistID3, Child, Playlist, SubsonicBaseResponse } from 'subsonic-api';

export type { ArtistID3, Child, Playlist, SubsonicAPI } from 'subsonic-api';

export interface SubsonicConfig {
    url: string;
    username: string;
    password: string;
    apiVersion: string;
    client: string;
    transcodeFormat: string;
    transcodeBitrate: number;
}

function authParams(config: SubsonicConfig): Record<string, string> {
    const salt = randomBytes(16).toString('hex');
    const token = createHash('md5').update(`${config.password}${salt}`).digest('hex');
    return {
        u: config.username,
        t: token,
        s: salt,
        v: config.apiVersion,
        c: config.client,
    };
}

function getRestUrl(api: SubsonicAPI, endpoint: string, params: Record<string, string>): string {
    return `${api.baseURL().replace(/\/+$/, '')}/rest/${endpoint}?${new URLSearchParams(params).toString()}`;
}

export async function getPlaylists(api: SubsonicAPI): Promise<Playlist[]> {
    const { playlists } = await api.getPlaylists();
    return playlists.playlist ?? [];
}

export async function getPlaylistSongs(api: SubsonicAPI, id: string): Promise<Child[]> {
    const { playlist } = await api.getPlaylist({ id });
    return (playlist.entry ?? []).filter((e) => !e.isVideo);
}

export async function getRandomSongs(api: SubsonicAPI, size: number): Promise<Child[]> {
    const { randomSongs } = await api.getRandomSongs({ size });
    return (randomSongs.song ?? []).filter((e) => !e.isVideo);
}

export async function getArtists(api: SubsonicAPI): Promise<ArtistID3[]> {
    const { artists } = await api.getArtists();
    return (artists.index ?? []).flatMap((i) => i.artist ?? []);
}

export async function getArtistSongs(api: SubsonicAPI, artistId: string): Promise<Child[]> {
    const albumList = (await api.getArtist({ id: artistId })).artist.album ?? [];
    const albums = await Promise.all(albumList.map((a) => api.getAlbum({ id: a.id })));
    return albums
        .map((a) => a.album)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
        .flatMap((a) => a.song ?? [])
        .filter((s) => !s.isVideo);
}

export async function getRecentlyAddedSongs(api: SubsonicAPI): Promise<Child[]> {
    const albumList = (await api.getAlbumList({ type: 'newest', size: 25 })).albumList.album ?? [];
    const albums = await Promise.all(albumList.map((a) => api.getAlbum({ id: a.id })));
    return albums
        .map((a) => a.album)
        .flatMap((a) => a.song ?? [])
        .filter((s) => !s.isVideo);
}

export async function getRecentlyPlayedSongs(api: SubsonicAPI): Promise<Child[]> {
    const albumList = (await api.getAlbumList({ type: 'recent', size: 25 })).albumList.album ?? [];
    const albums = await Promise.all(albumList.map((a) => api.getAlbum({ id: a.id })));
    return albums
        .map((a) => a.album)
        .flatMap((a) => a.song ?? [])
        .filter((s) => !s.isVideo);
}

export async function getMostPlayedSongs(api: SubsonicAPI): Promise<Child[]> {
    const albumList = (await api.getAlbumList({ type: 'frequent', size: 25 })).albumList.album ?? [];
    const albums = await Promise.all(albumList.map((a) => api.getAlbum({ id: a.id })));
    return albums
        .map((a) => a.album)
        .flatMap((a) => a.song ?? [])
        .filter((s) => !s.isVideo);
}

export async function getStarredSongs(api: SubsonicAPI): Promise<Child[]> {
    const songs = (await api.getStarred()).starred.song ?? [];
    return songs.filter((s) => !s.isVideo);
}

export function getStreamUrl(api: SubsonicAPI, config: SubsonicConfig, songId: string): string {
    return getRestUrl(api, 'stream', {
        ...authParams(config),
        id: songId,
        format: config.transcodeFormat,
        maxBitRate: String(config.transcodeBitrate),
        estimateContentLength: 'true',
    });
}

export function scrobble(api: SubsonicAPI, songId: string): Promise<SubsonicBaseResponse> {
    return api.scrobble({ id: songId, submission: true, time: Date.now() });
}

export async function getCoverArt(
    api: SubsonicAPI,
    config: SubsonicConfig,
    id: string,
    size: number,
): Promise<{ buf: Buffer; contentType: string } | null> {
    const res = await fetch(getRestUrl(api, 'getCoverArt', { ...authParams(config), id, size: String(size) }));
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, contentType };
}
