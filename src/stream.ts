import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { logger } from './logger.js';
import type { SubsonicAPI, SubsonicConfig } from './subsonic.js';
import { getStreamUrl } from './subsonic.js';
import { timed } from './utils.js';

const FORWARD_HEADERS = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'content-disposition',
    'etag',
    'last-modified',
];

export async function proxyStream(req: ExpressRequest, res: ExpressResponse, upstream: Response): Promise<void> {
    for (const h of FORWARD_HEADERS) {
        const v = upstream.headers.get(h);
        if (v) res.set(h, v);
    }
    res.status(upstream.status);
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('audio/') && !contentType.startsWith('video/')) {
        res.status(502).send('upstream error');
        return;
    }
    const body = upstream.body;
    if (!body) {
        res.end();
        return;
    }
    const reader = body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
    } catch {
        // client or upstream aborted
    } finally {
        try {
            res.end();
        } catch {}
    }
}

export async function drain(res: Response): Promise<void> {
    const body = res.body;
    if (!body) return;
    const reader = body.getReader();
    try {
        for (;;) {
            const { done } = await reader.read();
            if (done) return;
        }
    } catch {
        // cold responses declare an estimated content-length that exceeds the real
        // transcode, so undici terminates the stream on close — reading as far as
        // the server sent is enough to force the transcode to completion
    }
}

export interface StreamCall {
    method: string;
    range?: string;
}

function isTranscodeHot(res: Response, range?: string): boolean {
    return res.headers.get('accept-ranges') === 'bytes' && (range ? res.status === 206 : res.status === 200);
}

const requestStream = (url: string, method: string, range?: string) =>
    fetch(url, range ? { method, headers: { Range: range } } : { method });

/**
 * Fetch a Subsonic stream, forcing the server's transcode to finish before
 * returning bytes. Cold transcodes answer 200 with an *estimated*
 * content-length and no partial-range support; once the transcode completes
 * the server caches it (accept-ranges: bytes) and answers Range/206. The
 * returned Response is always the hot replay.
 */
export async function fetchTranscodedStream(url: string, call: StreamCall): Promise<Response> {
    const upstream = await requestStream(url, call.method, call.range);
    if (isTranscodeHot(upstream, call.range)) return upstream;

    if (call.method === 'HEAD') {
        await drain(await requestStream(url, 'GET'));
    } else {
        await drain(upstream);
    }
    return requestStream(url, call.method, call.range);
}

const warming = new Set<string>();
export function prewarm(api: SubsonicAPI, config: SubsonicConfig, songIds: string[]): void {
    for (const songId of songIds) {
        if (warming.has(songId)) {
            logger.debug({ songId }, 'Ignoring request to prewarm - already queued');
            continue;
        }
        warming.add(songId);
        void (async () => {
            const url = getStreamUrl(api, config, songId);
            try {
                const streamResponse = await requestStream(url, 'GET');
                if (streamResponse.ok === false) {
                    throw Error(`Response code ${streamResponse.status}`);
                } else if (isTranscodeHot(streamResponse)) {
                    logger.debug({ songId }, 'Skipped prewarm - already cached');
                } else {
                    logger.info({ songId }, 'Prewarming');
                    const { durationMs } = await timed(() => drain(streamResponse));
                    logger.info({ songId, durationMs }, 'Prewarmed');
                }
            } catch (e) {
                logger.error({ songId, err: e }, 'Failed to warm');
            } finally {
                warming.delete(songId);
            }
        })();
    }
}
