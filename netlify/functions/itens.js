import { getPool, json, baseHeaders } from './_db.js';

export default async function handler(request) {
    if (request.method === 'OPTIONS') return json(200, {});

    try {
        const pool = getPool();

        if (request.method === 'GET') {

            const url = new URL(request.url);
            const q = (url.searchParams.get('q') || '').trim();
            const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 1000);
            const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

            const where = [];
            const params = [];

            if (q) {
                where.push('i.nome_item LIKE ?');
                params.push(`%${q}%`);
            }

            const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

            // total geral (sem filtro) — útil para paginação no front
            const [metaRows] = await pool.query(
                `SELECT COUNT(*) AS total, MAX(atualizado_em) AS last_updated FROM itens`
            );
            const { total, last_updated } = metaRows[0] || {};

            // busca paginada (com filtro quando houver q)
            const [rows] = await pool.query(
                `
        SELECT i.id_item, i.nome_item, i.ativo, i.criado_em, i.atualizado_em
        FROM itens i
        ${whereSQL}
        ORDER BY i.nome_item ASC
        LIMIT ? OFFSET ?
        `,
                [...params, limit, offset]
            );

            return json(200, {
                items: rows,
                meta: { total, limit, offset, last_updated }
            });
        }
        // ===================== POST (criar) =====================
        if (request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const nome = (body.nome_item || '').trim();
            const ativo = Number(body.ativo ?? 1) ? 1 : 0;
            if (!nome) return json(400, { error: 'nome_item é obrigatório' });

            const [dupes] = await pool.query(
                'SELECT 1 FROM itens WHERE UPPER(nome_item) = UPPER(?) LIMIT 1',
                [nome]
            );
            if (dupes.length > 0) {
                return json(400, {
                    error: 'Já existe um item com este nome.',
                    fieldErrors: { nome_item: 'Já existe um item com este nome.' }
                });
            }

            const [res] = await pool.execute(
                `INSERT INTO itens (nome_item, ativo) VALUES (UPPER(?), ?)`,
                [nome, ativo]
            );
            return json(201, { id_item: res.insertId });
        }

        // ===================== PUT (atualizar) =====================
        if (request.method === 'PUT') {
            const body = await request.json().catch(() => ({}));
            const id = Number(body.id_item);
            if (!id) return json(400, { error: 'id_item é obrigatório' });

            const fields = [];
            const params = [];
            if (typeof body.nome_item === 'string') {
                const nomeNovo = body.nome_item.trim();
                if (!nomeNovo) {
                    return json(400, {
                        error: 'nome_item é obrigatório',
                        fieldErrors: { nome_item: 'Preencha o nome do item.' }
                    });
                }

                // Duplicado (exclui o próprio id)
                const [dupes] = await pool.query(
                    'SELECT * FROM itens WHERE UPPER(nome_item) = UPPER(?) AND id_item <> ? LIMIT 1',
                    [nomeNovo, id]
                );
                if (dupes.length > 0) {
                    return json(400, {
                        error: 'Já existe um item com este nome.',
                        fieldErrors: { nome_item: 'Já existe um item com este nome.' }
                    });
                }
                fields.push('nome_item = UPPER(?)');
                params.push(nomeNovo);

            }
            if (body.ativo !== undefined) { fields.push('ativo = ?'); params.push(Number(body.ativo) ? 1 : 0); }
            if (!fields.length) return json(400, { error: 'Nada para atualizar' });

            params.push(id);
            const [res] = await pool.execute(
                `UPDATE itens SET ${fields.join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id_item = ?`,
                params
            );
            return json(200, { updated: res.affectedRows > 0 });
        }

        // ===================== DELETE (excluir) =====================
        if (request.method === 'DELETE') {
            const url = new URL(request.url);
            const id = Number(url.searchParams.get('id'));
            if (!id) return json(400, { error: 'id é obrigatório' });

            // Se preferir "soft delete", troque por: UPDATE itens SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id_item = ?
            await pool.execute(
            `UPDATE itens SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id_item = ?`,
            [id]
            );
            return json(204, null)
        }

        return json(405, { error: 'Método não suportado' });
    } catch (err) {
        console.error(err);
        return json(500, { error: 'Falha no servidor', detail: err.message });
    }
}