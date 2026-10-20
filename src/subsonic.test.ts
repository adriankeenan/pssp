import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { SubsonicAPI, SubsonicConfig } from './subsonic.js';
import { getStreamUrl, scrobble } from './subsonic.js';

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

function paramsOf(url: string): URLSearchParams {
    return new URL(url).searchParams;
}

function authOf(url: string): { salt: string; token: string } {
    const params = paramsOf(url);
    const salt = params.get('s');
    const token = params.get('t');
    if (salt === null || token === null) throw new Error('missing token auth params');
    return { salt, token };
}

test('stream url uses token auth and no password', () => {
    const params = paramsOf(getStreamUrl(api, CONFIG, 'a'));
    assert.equal(params.get('u'), 'u');
    assert.equal(params.get('v'), '1.16.1');
    assert.equal(params.get('c'), 'test');
    const { salt, token } = authOf(getStreamUrl(api, CONFIG, 'a'));
    assert.ok(salt);
    assert.ok(token);
    assert.equal(params.get('p'), null);
    assert.ok(!params.toString().includes('enc:'));
});

test('token is md5 of password joined with the salt', () => {
    for (let i = 0; i < 5; i++) {
        const { salt, token } = authOf(getStreamUrl(api, CONFIG, 'a'));
        assert.equal(token, createHash('md5').update(`${CONFIG.password}${salt}`).digest('hex'));
    }
});

test('each request generates a fresh salt', () => {
    const salts = new Set<string>();
    for (let i = 0; i < 20; i++) salts.add(paramsOf(getStreamUrl(api, CONFIG, 'a')).get('s'));
    assert.equal(salts.size, 20);
});

test('scrobble submits immediately with submission=true and the current time', async () => {
    const calls: unknown[] = [];
    const spy = {
        scrobble: async (args: unknown) => {
            calls.push(args);
            return {};
        },
    } as unknown as SubsonicAPI;
    const before = Date.now();
    await scrobble(spy, 'a');
    const after = Date.now();
    assert.equal(calls.length, 1);
    const arg = calls[0] as { id: string; submission: boolean; time: number };
    assert.equal(arg.id, 'a');
    assert.equal(arg.submission, true);
    assert.ok(arg.time >= before && arg.time <= after);
});
