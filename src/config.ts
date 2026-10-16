import type { SubsonicConfig } from './subsonic.js';

export const APP_NAME = 'PlaySubsonicPortable';

function requiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`${key} must be set`);
    }
    return value;
}

export const PORT = Number(process.env.PSSP_PORT ?? 7777);
export const PUBLIC_URL = process.env.PSSP_PUBLIC_URL;
export const SUBSONIC_URL = requiredEnv('PSSP_SUBSONIC_URL');
export const SUBSONIC_USER = requiredEnv('PSSP_SUBSONIC_USER');
export const SUBSONIC_PASSWORD = requiredEnv('PSSP_SUBSONIC_PASSWORD');
export const SUBSONIC_API_VERSION = '1.16.1';
export const SUBSONIC_CLIENT = APP_NAME;
export const SUBSONIC_TRANSCODE_FORMAT = 'mp3';
export const SUBSONIC_TRANSCODE_BITRATE = Number(process.env.PSSP_SUBSONIC_TRANSCODE_BITRATE ?? 256);
export const IMG_SIZE_THUMB = 120;
export const IMG_SIZE_CHANNEL = 300;
export const FEED_LENGTH_MAX = 100;
export const PREWARM_NEXT = Number(process.env.PSSP_PREWARM_SONGS ?? 3);
export const LOG_PLAIN = process.env.PSSP_LOG_PLAIN === '1';

export const config: SubsonicConfig = {
    url: SUBSONIC_URL,
    username: SUBSONIC_USER,
    password: SUBSONIC_PASSWORD,
    apiVersion: SUBSONIC_API_VERSION,
    client: SUBSONIC_CLIENT,
    transcodeFormat: SUBSONIC_TRANSCODE_FORMAT,
    transcodeBitrate: SUBSONIC_TRANSCODE_BITRATE,
};
