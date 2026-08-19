import type { CorsOptions } from 'cors'
import type { RequestHandler } from 'express'

export const MUTATION_HEADER = 'x-market-radar-request'
export const MUTATION_HEADER_VALUE = 'same-origin'
const LEGACY_MUTATION_HEADER = 'x-mercadoradar-request'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1'])

export function requireLoopbackHost(rawValue: string | undefined) {
  const host = rawValue?.trim() || '127.0.0.1'
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('MARKET_RADAR_HOST only accepts 127.0.0.1 or ::1')
  }
  return host
}

function parseOrigin(value: string) {
  const candidate = value.trim()
  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`Invalid origin in MARKET_RADAR_ALLOWED_ORIGINS: ${candidate}`)
  }

  if (
    !ALLOWED_PROTOCOLS.has(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Only pathless HTTP(S) origins are allowed: ${candidate}`)
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
      forbidden(response, 'Origin not allowed')
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
          forbidden(response, 'Referer not allowed')
          return
        }
      } catch {
        forbidden(response, 'Invalid Referer')
        return
      }
    }

    if (!origin && fetchSite === 'cross-site') {
      forbidden(response, 'Cross-site request rejected')
      return
    }

    const mutationHeader = request.get(MUTATION_HEADER) ?? request.get(LEGACY_MUTATION_HEADER)
    if (mutationHeader !== MUTATION_HEADER_VALUE) {
      forbidden(response, `Missing ${MUTATION_HEADER} header`)
      return
    }

    const contentLength = Number(request.get('content-length') ?? 0)
    const hasBody = contentLength > 0 || Boolean(request.get('transfer-encoding'))
    if (hasBody && !request.is('application/json')) {
      response.status(415).json({ error: 'Mutations with a request body require application/json' })
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
    allowedHeaders: ['Content-Type', MUTATION_HEADER, LEGACY_MUTATION_HEADER],
    maxAge: 600,
  }
}
