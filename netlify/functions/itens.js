import { getPool, json, baseHeaders } from './_db.js';

export default async function handler(request) {
    if (request.method === 'OPTIONS') return json(200, {});

    try {
        const pool = getPool();

        //   Listar
        // LISTAR
        if (request.method === 'GET') {
            const { searchParams } = new URL(request.url);

            const qRaw = (searchParams.get('q') || '').trim();
            const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 1000);
            const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

            const hasQ = qRaw.length > 0;

            // Como a coluna está em utf8mb4_*_ci, LIKE já é case/acento-insensitive
            const whereSQL = hasQ ? 'WHERE i.nome_item LIKE ?' : '';
            const listParams = hasQ ? [`%${qRaw}%`, limit, offset] : [limit, offset];

            const listSQL = `
                SELECT i.id_item, i.nome_item, i.ativo, i.criado_em, i.atualizado_em
                FROM itens i
                ${whereSQL}
                ORDER BY i.nome_item ASC
                LIMIT ? OFFSET ?
                `;

            const metaSQL = `
                SELECT COUNT(*) AS total, MAX(atualizado_em) AS last_updated
                FROM itens
            `;

            const [[rows], [metaRows]] = await Promise.all([
                pool.query(listSQL, listParams),
                pool.query(metaSQL),
            ]);

            const { total = 0, last_updated = null } = metaRows?.[0] ?? {};

            return json(200, {
                items: rows,
                meta: { total, limit, offset, last_updated },
            });
        }

        // ===================== POST (criar) =====================
        if (request.method === 'POST') {
            const body = await request.json().catch(() => ({}));

            // Normaliza minimamente (compatível com nome_norm = TRIM(nome_item))
            const normalizeName = (s) =>
                String(s ?? '')
                    .normalize('NFKC')     // forma canônica (acentos etc.)
                    .replace(/\s+/g, ' ')  // colapsa múltiplos espaços internos
                    .trim();

            // Coerção robusta para bit
            const toBit = (v) => {
                if (typeof v === 'string') v = v.trim().toLowerCase();
                return (v === 1 || v === true || v === '1' || v === 'true' || v === 'on' || v === 'yes') ? 1 : 0;
            };

            const nome = normalizeName(body.nome_item);
            const ativo = toBit(body.ativo ?? 1);

            if (!nome) {
                return json(400, { error: 'nome_item é obrigatório', fieldErrors: { nome_item: 'Obrigatório' } });
            }

            try {
                // Confia no UNIQUE (nome_norm) para bloquear duplicados (insensitive).
                const [res] = await pool.execute(
                    'INSERT INTO itens (nome_item, ativo) VALUES (?, ?)',
                    [nome, ativo]
                );
                return json(201, { id_item: res.insertId });
            } catch (err) {
                // ER_DUP_ENTRY = 1062 (MySQL/MariaDB)
                if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
                    return json(400, {
                        error: 'Já existe um item com este nome.',
                        fieldErrors: { nome_item: 'Já existe um item com este nome.' }
                    });
                }
                throw err; // outros erros (timeout, conexão, etc.)
            }
        }


        // ===================== PUT (atualizar) =====================
        if (request.method === 'PUT') {
            const body = await request.json().catch(() => ({}));

            const id = Number.parseInt(body.id_item, 10);
            if (!id) return json(400, { error: 'id_item é obrigatório' });

            // Normaliza nome de forma estável (compatível com nome_norm = TRIM(nome_item))
            const normalizeName = (s) =>
                String(s ?? '')
                    .normalize('NFKC')     // normaliza forma/acentos
                    .replace(/\s+/g, ' ')  // colapsa múltiplos espaços
                    .trim();

            const sets = [];
            const params = [];

            if (Object.prototype.hasOwnProperty.call(body, 'nome_item')) {
                if (typeof body.nome_item !== 'string') {
                    return json(400, {
                        error: 'nome_item inválido',
                        fieldErrors: { nome_item: 'Deve ser uma string.' }
                    });
                }
                const nomeNovo = normalizeName(body.nome_item);
                if (!nomeNovo) {
                    return json(400, {
                        error: 'nome_item é obrigatório',
                        fieldErrors: { nome_item: 'Preencha o nome do item.' }
                    });
                }
                // Não usamos UPPER() — preserva a forma inserida; unicidade fica no UNIQUE(nome_norm)
                sets.push('nome_item = ?');
                params.push(nomeNovo);
            }

            if (Object.prototype.hasOwnProperty.call(body, 'ativo')) {
                const v = body.ativo;
                const bit = (typeof v === 'string')
                    ? (['1', 'true', 'on', 'yes'].includes(v.trim().toLowerCase()) ? 1 : 0)
                    : (v ? 1 : 0);
                sets.push('ativo = ?');
                params.push(bit);
            }

            if (sets.length === 0) {
                return json(400, { error: 'Nada para atualizar' });
            }

            // Sempre atualiza atualizado_em
            sets.push('atualizado_em = CURRENT_TIMESTAMP');

            params.push(id);

            try {
                const [res] = await pool.execute(
                    `UPDATE itens SET ${sets.join(', ')} WHERE id_item = ?`,
                    params
                );

                // Se quiser diferenciar "não encontrado":
                // if (res.affectedRows === 0) return json(404, { error: 'Item não encontrado' });

                return json(200, { updated: res.affectedRows > 0 });
            } catch (err) {
                // ER_DUP_ENTRY = 1062 (MySQL/MariaDB) — conflito com UNIQUE(nome_norm)
                if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
                    return json(400, {
                        error: 'Já existe um item com este nome.',
                        fieldErrors: { nome_item: 'Já existe um item com este nome.' }
                    });
                }
                throw err; // outros erros (conexão, timeout, etc.)
            }
        }

        // ===================== DELETE (excluir) =====================
        if (request.method === 'DELETE') {
            const { searchParams } = new URL(request.url);

            const idParam = (searchParams.get('id') || '').trim();
            if (!idParam) return json(400, { error: 'id é obrigatório' });

            // Aceita 1 ou vários ids: ?id=10,11,12
            const ids = idParam
                .split(',')
                .map(s => parseInt(s.trim(), 10))
                .filter(n => Number.isInteger(n) && n > 0);

            if (ids.length === 0) return json(400, { error: 'id inválido' });

            const doSoft = /^(1|true|yes|on)$/i.test((searchParams.get('soft') || '').trim());

            // IMPORTANTE: .execute não expande arrays em IN (?)
            const placeholders = ids.map(() => '?').join(',');

            try {
                let res;
                if (doSoft) {
                    [res] = await pool.execute(
                        `UPDATE itens
                            SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP
                            WHERE id_item IN (${placeholders}) AND ativo = 1`,
                        ids
                    );
                } else {
                    [res] = await pool.execute(
                        `DELETE FROM itens
          WHERE id_item IN (${placeholders})`,
                        ids
                    );
                }

                return json(200, {
                    deleted: res.affectedRows > 0,
                    count: res.affectedRows,
                    soft: doSoft
                });
            } catch (err) {
                console.error('DELETE itens failed', err);
                return json(500, { error: 'Falha no servidor', detail: err.message, code: err.code });
            }
        }

    } catch (err) {
        console.error('Erro no handler de itens:', err);
        return json(500, { error: 'Erro interno do servidor', details: err.message });
    }
}