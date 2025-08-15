import mysql from 'mysql2/promise';

let pool;
export function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST ? process.env.DB_HOST : 'localhost',
            user: process.env.DB_USER ? process.env.DB_USER : 'root',
            password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD : '',
            database: process.env.DB_NAME ? process.env.DB_NAME : 'controle_estoque',
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
            waitForConnections: true,
            connectionLimit: 5,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
        });
    }
    return pool;
}

export const baseHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'cache-control': 'public, max-age=15, s-maxage=60'
};

export const json = (status, data, extra = {}) =>
    new Response(JSON.stringify(data), { status, headers: { ...baseHeaders, ...extra } });
