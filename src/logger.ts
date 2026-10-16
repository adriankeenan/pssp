import type { Logger } from 'pino';
import { pino } from 'pino';
import { APP_NAME, LOG_PLAIN } from './config.js';

function buildPino(): Logger {
    return pino({
        name: APP_NAME,
        level: 'info',
        transport: LOG_PLAIN ? { target: 'pino-pretty' } : undefined,
    });
}

export const logger = buildPino();
