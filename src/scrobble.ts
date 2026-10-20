import { LRUCache } from 'lru-cache';
import type { SubsonicAPI } from './subsonic.js';

const scrobbledTracks = new LRUCache<string, true>({ max: 1000, ttl: 3 * 60_000 });

export async function scrobbleOnce(api: SubsonicAPI, songId: string): Promise<boolean> {
    if (scrobbledTracks.has(songId)) {
        return false;
    }
    scrobbledTracks.set(songId, true);
    await api.scrobble({ id: songId, submission: true, time: Date.now() });
    return true;
}
