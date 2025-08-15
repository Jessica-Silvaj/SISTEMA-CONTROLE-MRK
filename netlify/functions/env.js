// import 'dotenv/config'; // opcional: use se NÃO for usar `netlify dev`

const isNetlify = !!process.env.NETLIFY;
const isNetlifyLocal = process.env.NETLIFY_LOCAL === 'true' || process.env.CONTEXT === 'dev';
const isProd = process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production';
const isLocal = isNetlifyLocal || (!isNetlify && !isProd);

// defaults para DESENVOLVIMENTO LOCAL
const LOCAL_DEFAULTS = {
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: 'root',
    DB_PASSWORD: '',
    DB_NAME: 'controle_estoque',
    DB_SSL: 'false'
};

// Em produção (Railway), normalmente SSL é opcional.
// Se você habilitar “require SSL” no Railway, defina DB_SSL=true no Netlify.
const PROD_DEFAULTS = {
    DB_SSL: process.env.DB_SSL ?? 'false'
};

function pick(key, fallbackWhenLocal) {
    const envVal = process.env[key];
    if (envVal != null && envVal !== '') return envVal;
    if (isLocal) return fallbackWhenLocal;
    throw new Error(`Missing env: ${key}. Configure no Netlify (Site settings → Environment variables).`);
}

export const env = {
    DB_HOST: pick('DB_HOST', LOCAL_DEFAULTS.DB_HOST),
    DB_PORT: pick('DB_PORT', LOCAL_DEFAULTS.DB_PORT),
    DB_USER: pick('DB_USER', LOCAL_DEFAULTS.DB_USER),
    DB_PASSWORD: pick('DB_PASSWORD', LOCAL_DEFAULTS.DB_PASSWORD),
    DB_NAME: pick('DB_NAME', LOCAL_DEFAULTS.DB_NAME),
    DB_SSL: (process.env.DB_SSL ?? (isLocal ? LOCAL_DEFAULTS.DB_SSL : PROD_DEFAULTS.DB_SSL))
};

export const flags = { isLocal, isProd, isNetlify };
