import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEntries, buildFeed, orderedPubDate, toFeedEntry } from './feed.js';
import type { Child } from './subsonic.js';

const T = Date.UTC(2026, 8, 17, 5, 0, 0);
const SONGS_PUB_DATE = 'Wed, 17 Sep 2026 05:00:00 +0000';

const song = {
    id: 's1',
    albumId: 'al1',
    title: 'Song & Sample',
    artist: 'My Artist',
    album: 'Album <One>',
    year: 2001,
    duration: 245,
    isDir: false,
    isVideo: false,
} as Child;

const song2 = { ...song, id: 's2' } as Child;
const song3 = { ...song, id: 's3' } as Child;

const entry = toFeedEntry('http://x', song, SONGS_PUB_DATE);

test('orderedPubDate', async (t) => {
    await t.test('formats the first entry at the given time', () => {
        assert.equal(orderedPubDate(0, T), 'Thu, 17 Sep 2026 05:00:00 +0000');
    });

    await t.test('offsets each entry by 30 seconds', () => {
        assert.equal(orderedPubDate(1, T), 'Thu, 17 Sep 2026 04:59:30 +0000');
    });
});

test('toFeedEntry', async (t) => {
    await t.test('sets all entry fields', () => {
        assert.deepEqual(entry, {
            title: '[4:05] Song & Sample - My Artist',
            description: 'Song & Sample - My Artist - Album <One> [2001]',
            author: 'My Artist',
            pubDate: SONGS_PUB_DATE,
            id: 's1',
            url: 'http://x/media/s1.mp3',
            thumb: 'http://x/image/al1/thumb.jpg',
        });
    });

    await t.test('defaults to an empty author when the artist is missing', () => {
        assert.equal(toFeedEntry('http://x', { ...song, artist: undefined } as Child, SONGS_PUB_DATE).author, '');
    });

    await t.test('omits thumbnail when albumId is missing', () => {
        assert.equal(
            toFeedEntry('http://x', { ...song, albumId: undefined } as Child, SONGS_PUB_DATE).thumb,
            undefined,
        );
    });

    await t.test('shares a thumbnail across songs from the same album', () => {
        const other = { ...song, id: 's2' } as Child;
        assert.equal(
            toFeedEntry('http://x', song, SONGS_PUB_DATE).thumb,
            toFeedEntry('http://x', other, SONGS_PUB_DATE).thumb,
        );
    });

    await t.test('omits the next param when there are no next songs', () => {
        assert.equal(toFeedEntry('http://x', song, SONGS_PUB_DATE).url, 'http://x/media/s1.mp3');
    });

    await t.test('appends the comma-separated next ids to the media url', () => {
        assert.equal(
            toFeedEntry('http://x', song, SONGS_PUB_DATE, ['s2', 's3']).url,
            'http://x/media/s1.mp3?nextSongIds=s2,s3',
        );
    });
});

test('buildEntries', async (t) => {
    await t.test('sets each entry in order with 30 second spacing', () => {
        const entries = buildEntries('http://x', [song, song2, song3], 1, T);
        assert.deepEqual(
            entries.map((e) => e.pubDate),
            ['Thu, 17 Sep 2026 05:00:00 +0000', 'Thu, 17 Sep 2026 04:59:30 +0000', 'Thu, 17 Sep 2026 04:59:00 +0000'],
        );
    });

    await t.test('prewarm encodes the following songs into the media url', () => {
        const entries = buildEntries('http://x', [song, song2, song3], 2, T);
        assert.equal(entries[0].url, 'http://x/media/s1.mp3?nextSongIds=s2,s3');
        assert.equal(entries[1].url, 'http://x/media/s2.mp3?nextSongIds=s3');
        assert.equal(entries[2].url, 'http://x/media/s3.mp3');
    });

    await t.test('does not list any next songs when prewarm is 0', () => {
        const entries = buildEntries('http://x', [song, song2, song3], 0, T);
        for (const e of entries) {
            assert.equal(e.url.endsWith('?nextSongIds='), false);
        }
    });
});

test('buildFeed', async (t) => {
    await t.test('builds the full rss document for an entry', () => {
        assert.equal(
            buildFeed('http://x', 'My Feed', [entry], undefined, 120),
            `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>My Feed</title><link>http://x/</link><description>PlaySubsonicPortable playlist feed for Sony PSP</description><language>en-us</language><ttl>60</ttl><item><title>[4:05] Song &amp; Sample - My Artist</title><author>My Artist</author><link>http://x/media/s1.mp3</link><guid isPermaLink="false">s1</guid><pubDate>${SONGS_PUB_DATE}</pubDate><description>Song &amp; Sample - My Artist - Album &lt;One&gt; [2001]</description><media:content url="http://x/media/s1.mp3" type="audio/mpeg"/><media:thumbnail url="http://x/image/al1/thumb.jpg" width="120" height="120"/></item></channel></rss>`,
        );
    });

    await t.test('includes an image block when a coverUrl is set', () => {
        assert.equal(
            buildFeed('http://x', 'My Feed', [entry], 'http://x/image/art/cover', 120),
            `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>My Feed</title><link>http://x/</link><description>PlaySubsonicPortable playlist feed for Sony PSP</description><language>en-us</language><ttl>60</ttl><image><url>http://x/image/art/cover</url><title>My Feed</title><link>http://x/</link></image><item><title>[4:05] Song &amp; Sample - My Artist</title><author>My Artist</author><link>http://x/media/s1.mp3</link><guid isPermaLink="false">s1</guid><pubDate>${SONGS_PUB_DATE}</pubDate><description>Song &amp; Sample - My Artist - Album &lt;One&gt; [2001]</description><media:content url="http://x/media/s1.mp3" type="audio/mpeg"/><media:thumbnail url="http://x/image/al1/thumb.jpg" width="120" height="120"/></item></channel></rss>`,
        );
    });

    await t.test('omits thumbnail for entries without one', () => {
        const minimal = [
            {
                title: 'T',
                description: 'D',
                author: 'My Author',
                id: 'm1',
                url: 'http://x/m',
                pubDate: 'Thu, 17 Sep 2026 05:00:00 +0000',
            },
        ];
        const minimalFeed = buildFeed('http://x', 'My Feed', minimal);
        assert.equal(minimalFeed.includes('media:thumbnail'), false);
        assert.equal(
            minimalFeed,
            `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>My Feed</title><link>http://x/</link><description>PlaySubsonicPortable playlist feed for Sony PSP</description><language>en-us</language><ttl>60</ttl><item><title>T</title><author>My Author</author><link>http://x/m</link><guid isPermaLink="false">m1</guid><pubDate>Thu, 17 Sep 2026 05:00:00 +0000</pubDate><description>D</description><media:content url="http://x/m" type="audio/mpeg"/></item></channel></rss>`,
        );
    });
});
