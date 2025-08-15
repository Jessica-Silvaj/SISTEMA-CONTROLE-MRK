import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool;
export function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: env.DB_HOST,
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
            port: Number(env.DB_PORT),
            waitForConnections: true,
            connectionLimit: 5,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            ssl: env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined
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
