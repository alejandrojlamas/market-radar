import type { CorsOptions } from 'cors'
import type { RequestHandler } from 'express'

export const MUTATION_HEADER = 'x-mercadoradar-request'
export const MUTATION_HEADER_VALUE = 'same-origin'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function parseOrigin(value: string) {
  const candidate = value.trim()
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`Origen invalido en MERCADORADAR_ALLOWED_ORIGINS: ${candidate}`)
  }

  if (
    !ALLOWED_PROTOCOLS.has(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Solo se permiten origenes HTTP(S) sin ruta: ${candidate}`)
  }

  return url.origin
}

export function buildAllowedOrigins(rawValue: string | undefined, apiPort: number, webPort = 5174) {
  const configured = rawValue
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const candidates = configured?.length
    ? configured
    : [
        `http://127.0.0.1:${apiPort}`,
        `http://localhost:${apiPort}`,
        `http://127.0.0.1:${webPort}`,
        `http://localhost:${webPort}`,
      ]

  return new Set(candidates.map(parseOrigin))
}

function forbidden(response: Parameters<RequestHandler>[1], message: string) {
  response.status(403).json({ error: message })
}

export function rejectUnknownOrigins(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (request, response, next) => {
    const origin = request.get('origin')
    if (origin && !allowedOrigins.has(origin)) {
      forbidden(response, 'Origin no permitido')
      return
    }
    next()
  }
}

export function mutationGuard(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (request, response, next) => {
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
      next()
      return
    }

    const origin = request.get('origin')
    const referer = request.get('referer')
    const fetchSite = request.get('sec-fetch-site')

    if (!origin && referer) {
      try {
        if (!allowedOrigins.has(new URL(referer).origin)) {
          forbidden(response, 'Referer no permitido')
          return
        }
      } catch {
        forbidden(response, 'Referer invalido')
        return
      }
    }

    if (!origin && fetchSite === 'cross-site') {
      forbidden(response, 'Solicitud cross-site rechazada')
      return
    }

    if (request.get(MUTATION_HEADER) !== MUTATION_HEADER_VALUE) {
      forbidden(response, `Falta la cabecera ${MUTATION_HEADER}`)
      return
    }

    const contentLength = Number(request.get('content-length') ?? 0)
    const hasBody = contentLength > 0 || Boolean(request.get('transfer-encoding'))
    if (hasBody && !request.is('application/json')) {
      response.status(415).json({ error: 'Las mutaciones con cuerpo requieren application/json' })
      return
    }

    next()
  }
}

export function corsOptions(allowedOrigins: ReadonlySet<string>): CorsOptions {
  return {
    origin(origin, callback) {
      callback(null, Boolean(origin && allowedOrigins.has(origin)))
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', MUTATION_HEADER],
    maxAge: 600,
  }
}
