import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchTranscodedStream, prewarm } from './stream.js';
import type { SubsonicAPI, SubsonicConfig } from './subsonic.js';

const URL = 'http://upstream/rest/stream?anything';

type Call = { url: string; init: { method?: string; headers?: Record<string, string> } };
type Script = Array<(call: Call) => Response>;

function doneBody(): ReadableStream {
    return new ReadableStream({
        start(controller) {
            controller.close();
        },
    });
}

function hot(status = 200): Response {
    return new Response(doneBody(), {
        status,
        headers: { 'accept-ranges': 'bytes' },
    });
}

function cold(): Response {
    return new Response(doneBody(), { status: 200 });
}

function stubFetch(script: Script): {
    calls: Call[];
    restore: () => void;
} {
    const calls: Call[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const call: Call = { url: String(input), init: init ?? {} };
        calls.push(call);
        const producer = script.shift();
        if (!producer) throw new Error('unexpected extra fetch call');
        return producer(call);
    };
    return {
        calls,
        restore: () => {
            globalThis.fetch = real;
        },
    };
}

test('fetchTranscodedStream hot response is returned without re-hitting', async () => {
    const { calls, restore } = stubFetch([() => hot()]);
    try {
        const out = await fetchTranscodedStream(URL, { method: 'GET' });
        assert.equal(out.status, 200);
        assert.equal(calls.length, 1);
    } finally {
        restore();
    }
});

test('cold GET is drained and re-fetched once', async () => {
    const { calls, restore } = stubFetch([() => cold(), () => hot()]);
    try {
        const out = await fetchTranscodedStream(URL, { method: 'GET' });
        assert.equal(calls.length, 2);
        assert.equal(out.status, 200);
        assert.equal(calls[0].init.method, 'GET');
        assert.equal(calls[1].init.method, 'GET');
    } finally {
        restore();
    }
});

test('cold GET with Range is warmed and re-fetched with the Range header', async () => {
    const range = 'bytes=0-1023';
    const { calls, restore } = stubFetch([() => cold(), () => hot(206)]);
    try {
        const out = await fetchTranscodedStream(URL, { method: 'GET', range });
        assert.equal(calls.length, 2);
        assert.equal(out.status, 206);
        assert.equal(calls[1].init.headers?.Range, range);
    } finally {
        restore();
    }
});

test('cold HEAD is warmed with a full GET, drained, then re-hit', async () => {
    const { calls, restore } = stubFetch([() => cold(), () => hot(), () => hot()]);
    try {
        const out = await fetchTranscodedStream(URL, { method: 'HEAD' });
        assert.equal(calls.length, 3);
        assert.equal(out.status, 200);
        assert.equal(calls[0].init.method, 'HEAD');
        assert.equal(calls[1].init.method, 'GET');
        assert.equal(calls[2].init.method, 'HEAD');
    } finally {
        restore();
    }
});

function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
            if (predicate()) return resolve();
            if (Date.now() - started > timeout) return reject(new Error('timed out waiting for condition'));
            setTimeout(poll, 5);
        };
        poll();
    });
}

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

const CONFIG = {
    url: 'http://upstream',
    username: 'u',
    password: 'p',
    apiVersion: '1.16.1',
    client: 'test',
    transcodeFormat: 'mp3',
    transcodeBitrate: 256,
} as SubsonicConfig;
const api = { baseURL: () => 'http://upstream/' } as unknown as SubsonicAPI;

test('prewarm drains a cold GET once and dedupes concurrent calls', async () => {
    const { calls, restore } = stubFetch([() => cold()]);
    try {
        prewarm(api, CONFIG, ['a', 'a']);
        await waitFor(() => calls.length >= 1);
        await settle();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].init.method, 'GET');
        assert.ok(calls[0].url.includes('id=a'));
    } finally {
        restore();
    }
});

test('prewarm fetches each distinct song id', async () => {
    const { calls, restore } = stubFetch([() => cold(), () => cold()]);
    try {
        prewarm(api, CONFIG, ['a', 'b']);
        await waitFor(() => calls.length >= 2);
        await settle();
        assert.equal(calls.length, 2);
        const urls = calls.map((c) => c.url);
        assert.ok(urls.some((u) => u.includes('id=a')));
        assert.ok(urls.some((u) => u.includes('id=b')));
    } finally {
        restore();
    }
});

test('prewarm swallows upstream errors', async () => {
    const { calls, restore } = stubFetch([
        () => {
            throw new Error('boom');
        },
    ]);
    let unhandled: unknown = null;
    const onRejection = (e: unknown): void => {
        unhandled = e;
    };
    process.once('unhandledRejection', onRejection);
    try {
        prewarm(api, CONFIG, ['a']);
        await waitFor(() => calls.length >= 1);
        await settle();
        assert.equal(unhandled, null);
    } finally {
        process.off('unhandledRejection', onRejection);
        restore();
    }
});
