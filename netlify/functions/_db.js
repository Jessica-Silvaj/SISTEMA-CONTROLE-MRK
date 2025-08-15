// netlify/functions/_db.js
import mysql from 'mysql2/promise';
import { env, flags } from './env.js';

let pool;
export function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: env.DB_HOST,
            port: Number(env.DB_PORT),
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            ssl: env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined
        });
        // Log só uma vez, útil p/ checar se está em produção
        console.log(`[DB] Contexto: ${flags.CONTEXT} | host=${env.DB_HOST} db=${env.DB_NAME} ssl=${env.DB_SSL}`);
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
