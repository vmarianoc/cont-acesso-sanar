/**
 * Envio de e-mail transacional. Com SMTP_URL configurado usa nodemailer via
 * import dinâmico (dependência opcional); sem SMTP, loga o conteúdo — em dev
 * o link de reset/convite sai no log da API.
 */
export interface Mensagem {
  para: string
  assunto: string
  texto: string
}

export async function enviarEmail(msg: Mensagem, log: { info: (o: unknown, m?: string) => void }) {
  const smtpUrl = process.env.SMTP_URL
  if (!smtpUrl) {
    log.info({ email: msg }, 'SMTP_URL ausente — e-mail apenas logado (stub dev)')
    return { enviado: false, stub: true }
  }
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport(smtpUrl)
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'condar <nao-responda@condar.app>',
    to: msg.para,
    subject: msg.assunto,
    text: msg.texto,
  })
  return { enviado: true, stub: false }
}
