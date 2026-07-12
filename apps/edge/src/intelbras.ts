import { createHash, randomBytes } from 'node:crypto'
import pino from 'pino'
import type { DispositivoEdge } from './config.js'

const log = pino({ name: 'edge-intelbras' })

/**
 * Cliente da API BioT dos equipamentos Intelbras (controladores de acesso
 * facial e câmeras LPR), conforme a collection oficial
 * "Controle de Acesso - Bio-T - Intelbras". Auth: Digest MD5 (node:crypto,
 * sem SDK). Usuários/faces usam a API V2 JSON (AccessUser/AccessFace
 * insertMulti); a abertura de porta usa o accessControl.cgi (V1).
 */

const md5 = (v: string) => createHash('md5').update(v).digest('hex')

export async function digestFetch(
  dev: DispositivoEdge,
  caminho: string,
  init?: RequestInit
): Promise<Response> {
  const url = `http://${dev.ip}${caminho}`
  const primeira = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) })
  if (primeira.status !== 401) return primeira

  const desafio = primeira.headers.get('www-authenticate') ?? ''
  const campo = (nome: string) => desafio.match(new RegExp(`${nome}="?([^",]+)"?`))?.[1]
  const realm = campo('realm') ?? ''
  const nonce = campo('nonce') ?? ''
  const qop = campo('qop')
  const metodo = init?.method ?? 'GET'
  const uri = caminho
  const cnonce = randomBytes(8).toString('hex')
  const nc = '00000001'
  const ha1 = md5(`${dev.usuario}:${realm}:${dev.senha}`)
  const ha2 = md5(`${metodo}:${uri}`)
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`)
  const auth =
    `Digest username="${dev.usuario}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `response="${response}"` +
    (qop ? `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : '')
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), authorization: auth },
    signal: AbortSignal.timeout(4000),
  })
}

/** Abre o relé (cancela/porta), canal 1 — BioT V1. */
export async function abrirAcesso(dev: DispositivoEdge): Promise<boolean> {
  try {
    const res = await digestFetch(dev, '/cgi-bin/accessControl.cgi?action=openDoor&channel=1')
    return res.ok
  } catch (err) {
    log.warn({ dev: dev.nome, err: (err as Error).message }, 'falha ao acionar relé')
    return false
  }
}

// ---- Cadastro (API V2 JSON) ----

/** ValidFrom/ValidTo por padrão bem largos (pessoa permanente); um visitante
 * com convite facial informa a própria janela (`valido_de`/`valido_ate`) —
 * o equipamento passa a reforçar a validade mesmo antes da remoção pelo Edge. */
function formatoBioT(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
}

export function payloadUsuario(userId: string, nome: string, validFrom?: string, validTo?: string) {
  return {
    UserList: [
      {
        UserID: userId,
        UserName: nome,
        UserType: 0,
        UserStatus: 0,
        Authority: 1,
        Doors: [0],
        TimeSections: [255],
        ValidFrom: validFrom ? formatoBioT(validFrom) : '2020-01-01 00:00:00',
        ValidTo: validTo ? formatoBioT(validTo) : '2037-12-31 23:59:59',
      },
    ],
  }
}

export function payloadFace(userId: string, fotoBase64: string) {
  return { FaceList: [{ UserID: userId, PhotoData: [fotoBase64] }] }
}

async function postJson(dev: DispositivoEdge, caminho: string, body: unknown): Promise<boolean> {
  const res = await digestFetch(dev, caminho, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

/** Remove face + usuário do controlador. Usado tanto por pessoa.remover
 * quanto pela expiração automática de convite facial de visitante. */
export async function removerFacial(dev: DispositivoEdge, userId: string): Promise<boolean> {
  await digestFetch(dev, `/cgi-bin/AccessFace.cgi?action=removeMulti&UserIDList[0]=${userId}`)
  const res = await digestFetch(dev, `/cgi-bin/AccessUser.cgi?action=removeMulti&UserIDList[0]=${userId}`)
  return res.ok
}

/**
 * Aplica um comando da sync_queue no controlador facial. `userId` é o ID
 * numérico do BioT mapeado a partir do pessoa_id (uuid) pelo Store — o
 * equipamento não aceita UUID como UserID.
 */
export async function aplicarComando(
  dev: DispositivoEdge,
  comando: { tipo_comando: string; payload: Record<string, any> },
  userId: string
): Promise<boolean> {
  const p = comando.payload ?? {}
  try {
    switch (comando.tipo_comando) {
      case 'pessoa.criar': {
        return await postJson(dev, '/cgi-bin/AccessUser.cgi?action=insertMulti', payloadUsuario(userId, p.nome ?? ''))
      }
      case 'pessoa.atualizar': {
        // updateMulti falha se o usuário não existe; tenta update e cai para insert
        const ok = await postJson(dev, '/cgi-bin/AccessUser.cgi?action=updateMulti', payloadUsuario(userId, p.nome ?? ''))
        if (ok) return true
        return await postJson(dev, '/cgi-bin/AccessUser.cgi?action=insertMulti', payloadUsuario(userId, p.nome ?? ''))
      }
      case 'pessoa.remover': {
        return await removerFacial(dev, userId)
      }
      case 'face.atualizar': {
        if (!p.foto_base64) return true
        const ok = await postJson(dev, '/cgi-bin/AccessFace.cgi?action=updateMulti', payloadFace(userId, p.foto_base64))
        if (ok) return true
        return await postJson(dev, '/cgi-bin/AccessFace.cgi?action=insertMulti', payloadFace(userId, p.foto_base64))
      }
      case 'visitante.face.criar': {
        // Convite facial de visitante: cria o usuário já com a janela de
        // validade do convite (o próprio equipamento passa a barrar fora
        // da janela) e sobe a face. A remoção ao expirar é responsabilidade
        // do Edge (ver store.agendarRemocao / removerVencidas em index.ts).
        if (!p.foto_base64) return true
        const okUser = await postJson(
          dev,
          '/cgi-bin/AccessUser.cgi?action=insertMulti',
          payloadUsuario(userId, p.nome ?? '', p.valido_de, p.valido_ate)
        )
        if (!okUser) return false
        return await postJson(dev, '/cgi-bin/AccessFace.cgi?action=insertMulti', payloadFace(userId, p.foto_base64))
      }
      default:
        log.warn({ tipo: comando.tipo_comando }, 'comando desconhecido — marcando como executado')
        return true
    }
  } catch (err) {
    log.warn({ dev: dev.nome, tipo: comando.tipo_comando, err: (err as Error).message }, 'falha ao aplicar comando')
    return false
  }
}

/**
 * Provisiona o Event Server do BioT: o equipamento passa a empurrar eventos
 * de acesso por HTTP para o Edge (path /notification) com keepalive em
 * /keepalive — é assim que os acessos faciais chegam aqui.
 */
export async function configurarEventServer(
  dev: DispositivoEdge,
  edgeHost: string,
  porta: number
): Promise<boolean> {
  const upload =
    `/cgi-bin/configManager.cgi?action=setConfig&PictureHttpUpload.Enable=true` +
    `&PictureHttpUpload.UploadServerList[0].Address=${edgeHost}` +
    `&PictureHttpUpload.UploadServerList[0].Port=${porta}` +
    `&PictureHttpUpload.UploadServerList[0].Uploadpath=/notification`
  const modo =
    `/cgi-bin/configManager.cgi?action=setConfig&Intelbras_ModeCfg.DeviceMode=2` +
    `&Intelbras_ModeCfg.KeepAlive.Enable=true&Intelbras_ModeCfg.KeepAlive.Interval=120` +
    `&Intelbras_ModeCfg.KeepAlive.Path=/keepalive&Intelbras_ModeCfg.KeepAlive.TimeOut=2000` +
    `&Intelbras_ModeCfg.RemoteCheckTimeout=5`
  try {
    const r1 = await digestFetch(dev, upload)
    const r2 = await digestFetch(dev, modo)
    return r1.ok && r2.ok
  } catch (err) {
    log.warn({ dev: dev.nome, err: (err as Error).message }, 'falha ao provisionar Event Server')
    return false
  }
}

/** Extrai o UserID de um evento BioT (JSON ou multipart/texto). */
export function extrairUserIdEvento(corpo: string): string | null {
  try {
    const json = JSON.parse(corpo)
    const achar = (o: any): string | null => {
      if (o === null || typeof o !== 'object') return null
      for (const [k, v] of Object.entries(o)) {
        if (['UserID', 'userID', 'userId', 'CardNo'].includes(k) && (typeof v === 'string' || typeof v === 'number'))
          return String(v)
        if (typeof v === 'object') {
          const r = achar(v)
          if (r) return r
        }
      }
      return null
    }
    const r = achar(json)
    if (r) return r
  } catch {
    /* não é JSON */
  }
  const m = corpo.match(/["']?UserID["']?\s*[:=]\s*["']?(\w+)/i) ?? corpo.match(/["']?CardNo["']?\s*[:=]\s*["']?(\w+)/i)
  return m ? m[1] : null
}

/**
 * Extrai a foto (base64) de um evento facial ou push ANPR, quando o
 * equipamento a envia embutida na notificação — best-effort, igual a
 * extrairUserIdEvento/extrairPlaca: cobre os campos usuais e retorna null
 * sem travar nada se o formato do equipamento em campo divergir (calibrar
 * contra amostras reais do hardware instalado).
 */
export function extrairFotoEvento(corpo: string): string | null {
  try {
    const json = JSON.parse(corpo)
    const achar = (o: any): string | null => {
      if (o === null || typeof o !== 'object') return null
      for (const [k, v] of Object.entries(o)) {
        if (['PicData', 'Picture', 'Image', 'FaceImage', 'SnapPicture', 'Photo'].includes(k) && typeof v === 'string' && v.length > 100)
          return v
        if (typeof v === 'object') {
          const r = achar(v)
          if (r) return r
        }
      }
      return null
    }
    return achar(json)
  } catch {
    return null
  }
}
