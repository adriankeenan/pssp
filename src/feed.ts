import { APP_NAME } from './config.js';
import type { Child } from './subsonic.js';
import { formatDuration } from './utils.js';
import { escapeXml, tag } from './xml.js';

interface FeedEntry {
    title: string;
    description: string;
    url: string;
    id: string;
    author: string;
    pubDate: string;
    thumb?: string;
}

export function orderedPubDate(index: number, now: number = Date.now()): string {
    const d = new Date(now - index * 30_000);
    return d.toUTCString().replace(' GMT', ' +0000');
}

export function toFeedEntry(base: string, song: Child, pubDate: string, next: string[] = []): FeedEntry {
    const nextParam = next.length > 0 ? `?nextSongIds=${next.map((id) => encodeURIComponent(id)).join(',')}` : '';
    return {
        title: toFeedTitle(song),
        description: toFeedDescription(song),
        author: song.artist ?? '',
        pubDate,
        id: song.id,
        url: `${base}/media/${encodeURIComponent(song.id)}.mp3${nextParam}`,
        thumb: song.albumId ? `${base}/image/${encodeURIComponent(song.albumId)}/thumb.jpg` : undefined,
    };
}

export function buildEntries(base: string, songs: Child[], prewarm: number, now: number = Date.now()): FeedEntry[] {
    return songs.map((s, i) =>
        toFeedEntry(
            base,
            s,
            orderedPubDate(i, now),
            songs.slice(i + 1, i + 1 + prewarm).map((x) => x.id),
        ),
    );
}

function toFeedTitle(song: Child): string {
    return `[${formatDuration(song.duration ?? 0)}] ${song.title} - ${song.artist}`;
}

function toFeedDescription(song: Child): string {
    return `${song.title} - ${song.artist} - ${song.album} [${song.year}]`;
}

export function buildFeed(
    base: string,
    name: string,
    entries: FeedEntry[],
    coverUrl?: string,
    thumbSize?: number,
): string {
    const items = entries.map((e) =>
        tag('item', {}, [
            tag('title', {}, [escapeXml(e.title)]),
            tag('author', {}, [escapeXml(e.author)]),
            tag('link', {}, [escapeXml(e.url)]),
            tag('guid', { isPermaLink: 'false' }, [escapeXml(e.id)]),
            tag('pubDate', {}, [e.pubDate]),
            tag('description', {}, [escapeXml(e.description)]),
            tag('media:content', { url: e.url, type: 'audio/mpeg' }),
            ...(e.thumb
                ? [
                      tag('media:thumbnail', {
                          url: e.thumb,
                          width: String(thumbSize),
                          height: String(thumbSize),
                      }),
                  ]
                : []),
        ]),
    );

    const channel = [
        tag('title', {}, [escapeXml(name)]),
        tag('link', {}, [`${escapeXml(base)}/`]),
        tag('description', {}, [`${APP_NAME} playlist feed for Sony PSP`]),
        tag('language', {}, ['en-us']),
        tag('ttl', {}, ['60']),
        ...(coverUrl
            ? [
                  tag('image', {}, [
                      tag('url', {}, [escapeXml(coverUrl)]),
                      tag('title', {}, [escapeXml(name)]),
                      tag('link', {}, [`${escapeXml(base)}/`]),
                  ]),
              ]
            : []),
        ...items,
    ];

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        tag('rss', { version: '2.0', 'xmlns:media': 'http://search.yahoo.com/mrss/' }, [tag('channel', {}, channel)])
    );
}
