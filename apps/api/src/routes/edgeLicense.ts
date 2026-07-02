import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { validarLicencaPorKey } from '../services/licencaService.js'

const ValidateBody = z.object({
  license_key: z.string().min(8),
  fingerprint: z.string().optional(),
})

// Autenticação do Edge é feita pela própria license_key (+ fingerprint do
// hardware). Não usa o JWT de usuário, por isso fica fora do hook de auth.
const edgeLicenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/edge/validate-license', async (request, reply) => {
    const parsed = ValidateBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const resultado = await validarLicencaPorKey(
      fastify.db,
      parsed.data.license_key,
      parsed.data.fingerprint
    )

    if (resultado.status === 'nao_encontrada') {
      return reply.status(404).send({
        erro: { codigo: 'LICENCA_NAO_ENCONTRADA', mensagem: 'Chave de licença inválida' },
      })
    }
    if (resultado.status === 'fingerprint_invalido') {
      return reply.status(409).send({
        erro: {
          codigo: 'FINGERPRINT_INVALIDO',
          mensagem:
            'Licença vinculada a outro hardware. Reativação em novo Edge requer aprovação do suporte.',
        },
      })
    }

    const { status: _s, ...dados } = resultado
    return reply.status(200).send({ data: dados })
  })
}

export default edgeLicenseRoutes
