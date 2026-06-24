import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import pool from '../db'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface CartQuery {
  sessionId: string
}

interface CartBody {
  items: object[]
}

export async function cartRoutes(fastify: FastifyInstance) {

  // ----------------------------------------
  // GET /cart?sessionId=xxx — load cart
  // ----------------------------------------
  fastify.get<{ Querystring: CartQuery }>('/cart', async (req: FastifyRequest<{ Querystring: CartQuery }>, reply: FastifyReply) => {
    const { sessionId } = req.query

    if (!sessionId || !uuidRegex.test(sessionId)) {
      return reply.status(400).send({ error: 'Invalid sessionId' })
    }

    try {
      const result = await pool.query(
        'SELECT items FROM guest_carts WHERE session_id = $1',
        [sessionId]
      )

      if (result.rows.length === 0) return reply.send({ items: [] })
      return reply.send({ items: result.rows[0].items })
    } catch (err: any) {
      fastify.log.error('GET /cart error:', err)
      return reply.status(500).send({ error: err.message })
    }
  })

  // ----------------------------------------
  // POST /cart?sessionId=xxx — save cart
  // ----------------------------------------
  fastify.post<{ Querystring: CartQuery; Body: CartBody }>('/cart', async (req: FastifyRequest<{ Querystring: CartQuery; Body: CartBody }>, reply: FastifyReply) => {
    const { sessionId } = req.query
    const { items } = req.body

    if (!sessionId || !uuidRegex.test(sessionId)) {
      return reply.status(400).send({ error: 'Invalid sessionId' })
    }

    if (!Array.isArray(items)) {
      return reply.status(400).send({ error: 'items must be an array' })
    }

    try {
      await pool.query(
        `INSERT INTO guest_carts (session_id, items)
         VALUES ($1, $2)
         ON CONFLICT (session_id)
         DO UPDATE SET items = $2, updated_at = now()`,
        [sessionId, JSON.stringify(items)]
      )

      return reply.send({ success: true })
    } catch (err: any) {
      fastify.log.error('POST /cart error:', err)
      return reply.status(500).send({ error: err.message })
    }
  })

  // ----------------------------------------
  // DELETE /cart?sessionId=xxx — clear cart
  // ----------------------------------------
  fastify.delete<{ Querystring: CartQuery }>('/cart', async (req: FastifyRequest<{ Querystring: CartQuery }>, reply: FastifyReply) => {
    const { sessionId } = req.query

    if (!sessionId || !uuidRegex.test(sessionId)) {
      return reply.status(400).send({ error: 'Invalid sessionId' })
    }

    try {
      await pool.query(
        'DELETE FROM guest_carts WHERE session_id = $1',
        [sessionId]
      )

      return reply.send({ success: true })
    } catch (err: any) {
      fastify.log.error('DELETE /cart error:', err)
      return reply.status(500).send({ error: err.message })
    }
  })
}