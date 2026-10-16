export type Attrs = Record<string, string>;

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function tag(name: string, attrs: Attrs = {}, children: string[] = []): string {
    const a = Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
        .join('');
    return children.length ? `<${name}${a}>${children.join('')}</${name}>` : `<${name}${a}/>`;
}
