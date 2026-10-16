import { APP_NAME } from './config.js';
import type { ArtistID3, Playlist } from './subsonic.js';
import { escapeXml } from './xml.js';

export function buildIndex(base: string, playlists: Playlist[], artists: ArtistID3[]): string {
    const magicFeeds = `  <li><a href="${escapeXml(`${base}/feed/random.xml`)}">Random</a></li>
  <li><a href="${escapeXml(`${base}/feed/recent.xml`)}">Recently Added</a></li>
  <li><a href="${escapeXml(`${base}/feed/played.xml`)}">Recently Played</a></li>
  <li><a href="${escapeXml(`${base}/feed/mostplayed.xml`)}">Most Played</a></li>
  <li><a href="${escapeXml(`${base}/feed/starred.xml`)}">Starred</a></li>`;
    const playlistLinks = playlists
        .map(
            (p) =>
                `  <li><a href="${escapeXml(`${base}/feed/playlist/${encodeURIComponent(p.id)}.xml`)}">${escapeXml(p.name)}</a></li>`,
        )
        .join('\n');
    const artistLinks = artists
        .map(
            (a) =>
                `  <li><a href="${escapeXml(`${base}/feed/artist/${encodeURIComponent(a.id)}.xml`)}">${escapeXml(a.name)}</a></li>`,
        )
        .join('\n');
    return `<!DOCTYPE html>
<html>
<head><title>${APP_NAME}</title></head>
<body>
<h1>${APP_NAME}</h1>
<p>Subsonic to RSS bridge for PSP</p>
<ul>
${magicFeeds}
</ul>
<h2>Playlists</h2>
<ul>
${playlistLinks}
</ul>
<h2>Artists</h2>
<ul>
${artistLinks}
</ul>
</body>
</html>`;
}
