import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrobbleOnce } from './scrobble.js';
import type { SubsonicAPI } from './subsonic.js';

test('scrobbleOnce submits the first time and skips repeats within the window', async () => {
    const calls: unknown[] = [];
    const api = {
        scrobble: async (args: unknown) => {
            calls.push(args);
            return {};
        },
    } as unknown as SubsonicAPI;
    const id = `track-${Date.now()}`;
    const before = Date.now();
    assert.equal(await scrobbleOnce(api, id), true);
    const after = Date.now();
    assert.equal(await scrobbleOnce(api, id), false);
    assert.equal(calls.length, 1);
    const arg = calls[0] as { id: string; submission: boolean; time: number };
    assert.equal(arg.id, id);
    assert.equal(arg.submission, true);
    assert.ok(arg.time >= before && arg.time <= after);
});
