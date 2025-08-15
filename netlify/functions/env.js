// netlify/functions/env.js
// import 'dotenv/config'; // use se NÃO for rodar com `netlify dev`

// CONTEXT polyfill (Netlify já seta em produção)
const CONTEXT =
    process.env.CONTEXT ||
    (process.env.NETLIFY_LOCAL === 'true' ? 'dev'
        : process.env.NODE_ENV === 'production' ? 'production'
            : 'dev');

export const flags = {
    CONTEXT,
    isProd: CONTEXT === 'production',
    isDev: CONTEXT === 'dev' || CONTEXT === 'development',
    isNetlify: !!process.env.NETLIFY,
    isNetlifyLocal: process.env.NETLIFY_LOCAL === 'true'
};

// --- Parse mysql://user:pass@host:port/db?ssl=true ---
function parseDbUrl(urlStr) {
    if (!urlStr) return null;
    try {
        const u = new URL(urlStr);
        const isMysqls = u.protocol.replace(':', '') === 'mysqls';
        const cfg = {
            DB_HOST: u.hostname,
            DB_PORT: u.port || '3306',
            DB_USER: decodeURIComponent(u.username || ''),
            DB_PASSWORD: decodeURIComponent(u.password || ''),
            DB_NAME: (u.pathname || '').replace(/^\//, ''),
            DB_SSL: isMysqls ? 'true' : undefined
        };
        if (u.searchParams.has('ssl')) {
            cfg.DB_SSL = String(u.searchParams.get('ssl')).toLowerCase() === 'true' ? 'true' : 'false';
        }
        return cfg;
    } catch { return null; }
}

// --- Monta a URL a partir das vars padrão do Railway, se não houver DB_URL ---
function fromRailwayPieces() {
    const user = process.env.MYSQLUSER || process.env.DB_USER;
    const pass = process.env.MYSQL_ROOT_PASSWORD || process.env.DB_PASSWORD;
    const host = process.env.RAILWAY_TCP_PROXY_DOMAIN || process.env.MYSQLHOST || process.env.DB_HOST;
    const port = process.env.RAILWAY_TCP_PROXY_PORT || process.env.MYSQLPORT || process.env.DB_PORT || '3306';
    const db = process.env.MYSQL_DATABASE || process.env.DB_NAME;
    if (user && pass && host && db) {
        const url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
        return parseDbUrl(url);
    }
    return null;
}

const LOCAL_DEFAULTS = {
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: 'root',
    DB_PASSWORD: '',
    DB_NAME: 'controle_estoque',
    DB_SSL: 'false'
};

function pick(key, fallbackWhenLocal) {
    const v = process.env[key];
    if (v != null && v !== '') return v;
    if (flags.isDev && !flags.isNetlify) return fallbackWhenLocal;
    throw new Error(`Missing env: ${key}. Configure no Netlify (Site settings → Environment variables).`);
}

const fromUrl = parseDbUrl(process.env.DB_URL || process.env.MYSQL_URL || process.env.CLEARDB_DATABASE_URL || '');
const fromRwy = !fromUrl ? fromRailwayPieces() : null;

export const env = {
    DB_HOST: fromUrl?.DB_HOST ?? fromRwy?.DB_HOST ?? pick('DB_HOST', LOCAL_DEFAULTS.DB_HOST),
    DB_PORT: fromUrl?.DB_PORT ?? fromRwy?.DB_PORT ?? pick('DB_PORT', LOCAL_DEFAULTS.DB_PORT),
    DB_USER: fromUrl?.DB_USER ?? fromRwy?.DB_USER ?? pick('DB_USER', LOCAL_DEFAULTS.DB_USER),
    DB_PASSWORD: fromUrl?.DB_PASSWORD ?? fromRwy?.DB_PASSWORD ?? pick('DB_PASSWORD', LOCAL_DEFAULTS.DB_PASSWORD),
    DB_NAME: fromUrl?.DB_NAME ?? fromRwy?.DB_NAME ?? pick('DB_NAME', LOCAL_DEFAULTS.DB_NAME),
    DB_SSL: (
        fromUrl?.DB_SSL ??
        process.env.DB_SSL ??
        (flags.isDev ? LOCAL_DEFAULTS.DB_SSL : 'false') // Railway normalmente sem SSL obrigatório
    )
};
