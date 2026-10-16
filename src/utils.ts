import os from 'node:os';

export function stripExtension(name: string, ext: string): string {
    const suffix = `.${ext}`;
    return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export function formatDuration(total: number): string {
    const h = total / 3600;
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h >= 1
        ? `${Math.floor(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

export function getLanIp(): string {
    try {
        for (const addrs of Object.values(os.networkInterfaces())) {
            for (const addr of addrs ?? []) {
                if (addr.family === 'IPv4' && addr.address !== '127.0.0.1') {
                    return addr.address;
                }
            }
        }
    } catch {}
    return '127.0.0.1';
}

export async function timed<T>(fn: () => T): Promise<{ result: T; durationMs: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const durationMs = Math.round(Number(end - start) / 1_000_000);
    return { result, durationMs };
}
