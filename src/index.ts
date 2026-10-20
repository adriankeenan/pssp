import express from 'express';
import SubsonicAPI from 'subsonic-api';
import {
    APP_NAME,
    config,
    FEED_LENGTH_MAX,
    IMG_SIZE_CHANNEL,
    IMG_SIZE_THUMB,
    PORT,
    PREWARM_NEXT,
    PUBLIC_URL,
    SCROBBLE_ENABLED,
} from './config.js';
import { buildEntries, buildFeed } from './feed.js';
import { buildIndex } from './html.js';
import { logger } from './logger.js';
import { fetchTranscodedStream, prewarm, proxyStream } from './stream.js';
import {
    type ArtistID3,
    type Child,
    getArtistSongs,
    getArtists,
    getCoverArt,
    getMostPlayedSongs,
    getPlaylistSongs,
    getPlaylists,
    getRandomSongs,
    getRecentlyAddedSongs,
    getRecentlyPlayedSongs,
    getStarredSongs,
    getStreamUrl,
    type Playlist,
    scrobble,
} from './subsonic.js';
import { getLanIp, stripExtension } from './utils.js';

const api = new SubsonicAPI({ url: config.url, auth: { username: config.username, password: config.password } });

const app = express();

app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    logger.info({ method: req.method, url: req.originalUrl, ip: req.ip }, 'request');

    res.on('finish', () => {
        const endNs = process.hrtime.bigint();
        const ms = Math.round(Number(endNs - start) / 1_000_000);
        const contentLength = res.get('content-length');
        logger.info(
            {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                durationMs: ms,
                bytes: contentLength === undefined ? undefined : Number(contentLength),
            },
            'response',
        );
    });
    next();
});

async function main() {
    const base = PUBLIC_URL ?? `http://${getLanIp()}:${PORT}`;

    app.get('/', async (_req, res) => {
        let playlists: Playlist[];
        let artists: ArtistID3[];
        try {
            [playlists, artists] = await Promise.all([getPlaylists(api), getArtists(api)]);
        } catch (_e) {
            res.status(502).send('Subsonic server unreachable');
            return;
        }
        res.type('html');
        res.send(buildIndex(base, playlists, artists));
    });

    app.get('/feed/:type', async (req, res) => {
        const magicFeeds: Record<string, { name: string; load: () => Promise<Child[]> }> = {
            random: { name: 'Random', load: () => getRandomSongs(api, FEED_LENGTH_MAX) },
            recent: { name: 'Recently Added', load: () => getRecentlyAddedSongs(api) },
            played: { name: 'Recently Played', load: () => getRecentlyPlayedSongs(api) },
            mostplayed: { name: 'Most Played', load: () => getMostPlayedSongs(api) },
            starred: { name: 'Starred', load: () => getStarredSongs(api) },
        };
        const feed = magicFeeds[stripExtension(req.params.type, 'xml')];
        if (!feed) {
            res.status(404).send('unknown feed');
            return;
        }
        let songs: Child[];
        try {
            songs = await feed.load();
        } catch {
            res.status(502).send('Subsonic server unreachable');
            return;
        }
        const entries = buildEntries(base, songs.slice(0, FEED_LENGTH_MAX), PREWARM_NEXT);
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.send(buildFeed(base, feed.name, entries, undefined, IMG_SIZE_THUMB));
    });

    app.get('/feed/playlist/:playlistId', async (req, res) => {
        const id = stripExtension(req.params.playlistId, 'xml');
        let playlist: Playlist | undefined;
        let songs: Child[];
        try {
            const playlists = await getPlaylists(api);
            playlist = playlists.find((p) => p.id === id);
            songs = await getPlaylistSongs(api, id);
        } catch {
            res.status(502).send('Subsonic server unreachable');
            return;
        }
        if (!playlist) {
            res.status(404).send('unknown playlist');
            return;
        }

        const entries = buildEntries(base, songs.slice(0, FEED_LENGTH_MAX), PREWARM_NEXT);
        const coverUrl = playlist.coverArt
            ? `${base}/image/${encodeURIComponent(playlist.coverArt)}/cover.jpg`
            : undefined;
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.send(buildFeed(base, playlist.name, entries, coverUrl, IMG_SIZE_THUMB));
    });

    app.get('/feed/artist/:artistId', async (req, res) => {
        const id = stripExtension(req.params.artistId, 'xml');
        let artist: ArtistID3 | undefined;
        let songs: Child[];
        try {
            const artists = await getArtists(api);
            artist = artists.find((a) => a.id === id);
            songs = await getArtistSongs(api, id);
        } catch {
            res.status(502).send('Subsonic server unreachable');
            return;
        }
        if (!artist) {
            res.status(404).send('unknown artist');
            return;
        }

        const entries = buildEntries(base, songs.slice(0, FEED_LENGTH_MAX), PREWARM_NEXT);
        const coverUrl = artist.coverArt ? `${base}/image/${encodeURIComponent(artist.coverArt)}/cover.jpg` : undefined;
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.send(buildFeed(base, artist.name, entries, coverUrl, IMG_SIZE_THUMB));
    });

    app.get('/image/:imageId/:variant', async (req, res) => {
        const variant = stripExtension(req.params.variant, 'jpg');
        const size = variant === 'thumb' ? IMG_SIZE_THUMB : variant === 'cover' ? IMG_SIZE_CHANNEL : null;
        if (size === null) {
            res.status(404).end();
            return;
        }
        try {
            const art = await getCoverArt(api, config, req.params.imageId, size);
            if (!art) {
                res.status(404).end();
                return;
            }
            res.set('Content-Type', art.contentType);
            res.send(art.buf);
        } catch {
            res.status(502).send('Subsonic server unreachable');
        }
    });

    app.get('/media/:songId', async (req, res) => {
        const nextSongIds = String(req.query.nextSongIds ?? '')
            .split(',')
            .filter(Boolean)
            .slice(0, PREWARM_NEXT);
        prewarm(api, config, nextSongIds);

        const id = stripExtension(req.params.songId, 'mp3');
        if (SCROBBLE_ENABLED && req.method !== 'HEAD') {
            scrobble(api, id)
                .then(() => logger.info({ songId: id }, 'Scrobbled'))
                .catch((e) => logger.error({ songId: id, err: e }, 'Scrobble failed'));
        }
        const url = getStreamUrl(api, config, id);
        try {
            const upstream = await fetchTranscodedStream(url, {
                method: req.method,
                range: req.headers.range,
            });
            await proxyStream(req, res, upstream);
        } catch (e) {
            res.status(502).send(`upstream unreachable - ${e}`);
            return;
        }
    });

    app.listen(PORT, '0.0.0.0', () => {
        logger.info('%s: %s/', APP_NAME, base);
    });
}

main();
