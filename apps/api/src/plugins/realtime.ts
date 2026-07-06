import fp from 'fastify-plugin'
import { Redis } from 'ioredis'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { randomUUID } from 'node:crypto'

/**
 * Tempo real via SSE + Redis pub/sub.
 *
 * Canais (por schema de tenant):
 *   pessoa:<pessoa_id>  — eventos direcionados ao morador (solicitação, encomenda)
 *   perfil:<perfil>     — eventos por papel (ex.: porteiro vê decisões na hora)
 *
 * O publish passa pelo Redis para funcionar com múltiplas instâncias da API.
 */

export interface EventoRt {
  tipo: string
  dados?: Record<string, unknown>
}

declare module 'fastify' {
  interface FastifyInstance {
    publishRt: (schema: string, canais: string[], evento: EventoRt) => Promise<void>
  }
}

const realtimePlugin: FastifyPluginAsync = async (fastify) => {
  // chave local: `${schema}|${canal}` → conexões SSE abertas nesta instância
  const clientes = new Map<string, Set<FastifyReply>>()

  const sub = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 3 })
  await sub.connect()
  await sub.psubscribe('rt:*')
  sub.on('pmessage', (_pattern, channel, message) => {
    const locais = clientes.get(channel.slice(3))
    if (!locais?.size) return
    for (const reply of locais) {
      reply.raw.write(`data: ${message}\n\n`)
    }
  })

  fastify.decorate('publishRt', async (schema: string, canais: string[], evento: EventoRt) => {
    const payload = JSON.stringify({ ...evento, em: new Date().toISOString() })
    for (const canal of canais) {
      await fastify.redis.publish(`rt:${schema}|${canal}`, payload)
    }
  })

  /**
   * EventSource não envia headers; para não expor o JWT em query string/logs
   * de proxy, o cliente troca o JWT por um ticket de uso único (30s) e abre
   * o stream com ele. O token via query segue aceito como fallback legado.
   */
  fastify.post('/rt/ticket', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const ticket = randomUUID()
    await fastify.redis.set(
      `rt:ticket:${ticket}`,
      JSON.stringify(request.user),
      'EX',
      30
    )
    return reply.status(201).send({ data: { ticket } })
  })

  fastify.get('/rt/stream', async (request, reply) => {
    const { token, ticket } = request.query as { token?: string; ticket?: string }
    let payload: { sub: string; perfil: string; schema_name: string }
    if (ticket) {
      const bruto = await fastify.redis.getdel(`rt:ticket:${ticket}`)
      if (!bruto) {
        return reply.status(401).send({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Ticket inválido ou expirado' } })
      }
      payload = JSON.parse(bruto)
    } else {
      try {
        payload = fastify.jwt.verify(token ?? '')
      } catch {
        return reply.status(401).send({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Token inválido' } })
      }
    }

    const schema = payload.schema_name
    const [usuario] = await fastify.withTenant(schema, (sql) =>
      sql.unsafe(`SELECT pessoa_id FROM usuarios_tenant WHERE id = $1`, [payload.sub])
    )

    const canais = [`perfil:${payload.perfil}`]
    if (usuario?.pessoa_id) canais.push(`pessoa:${usuario.pessoa_id}`)

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    reply.raw.write(`data: ${JSON.stringify({ tipo: 'conectado', canais })}\n\n`)

    const chaves = canais.map((c) => `${schema}|${c}`)
    for (const chave of chaves) {
      if (!clientes.has(chave)) clientes.set(chave, new Set())
      clientes.get(chave)!.add(reply)
    }

    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 25000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      for (const chave of chaves) {
        clientes.get(chave)?.delete(reply)
        if (clientes.get(chave)?.size === 0) clientes.delete(chave)
      }
    })

    return reply
  })

  fastify.addHook('onClose', async () => {
    for (const conjunto of clientes.values()) {
      for (const reply of conjunto) reply.raw.end()
    }
    await sub.quit()
  })
}

export default fp(realtimePlugin, { name: 'realtime', dependencies: ['redis', 'jwt', 'db'] })
