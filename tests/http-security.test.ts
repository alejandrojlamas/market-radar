import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { after, before } from 'node:test'
import cors from 'cors'
import express from 'express'
import {
  MUTATION_HEADER,
  MUTATION_HEADER_VALUE,
  buildAllowedOrigins,
  corsOptions,
  mutationGuard,
  rejectUnknownOrigins,
} from '../server/httpSecurity'

const trustedOrigin = 'http://127.0.0.1:5174'
const allowedOrigins = buildAllowedOrigins(trustedOrigin, 8787)
const app = express()
app.use(rejectUnknownOrigins(allowedOrigins))
app.use(cors(corsOptions(allowedOrigins)))
app.use(mutationGuard(allowedOrigins))
app.use(express.json())
app.get('/resource', (_request, response) => response.json({ ok: true }))
app.post('/resource', (_request, response) => response.json({ ok: true }))

const server = createServer(app)
let baseUrl = ''

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('buildAllowedOrigins uses exact loopback defaults and rejects paths', () => {
  const defaults = buildAllowedOrigins(undefined, 8797)
  assert.deepEqual(
    [...defaults],
    [
      'http://127.0.0.1:8797',
      'http://localhost:8797',
      'http://127.0.0.1:5174',
      'http://localhost:5174',
    ],
  )
  assert.throws(() => buildAllowedOrigins('https://example.test/app', 8797), /sin ruta/)
})

test('an unlisted Origin is rejected instead of receiving permissive CORS', async () => {
  const response = await fetch(`${baseUrl}/resource`, {
    headers: { origin: 'https://attacker.example' },
  })

  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.deepEqual(await response.json(), { error: 'Origin no permitido' })
})

test('preflight reflects only an explicitly allowed Origin', async () => {
  const response = await fetch(`${baseUrl}/resource`, {
    method: 'OPTIONS',
    headers: {
      origin: trustedOrigin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': `content-type,${MUTATION_HEADER}`,
    },
  })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), trustedOrigin)
  assert.match(response.headers.get('vary') ?? '', /Origin/)
})

test('mutations require the non-simple request header', async () => {
  const response = await fetch(`${baseUrl}/resource`, {
    method: 'POST',
    headers: { origin: trustedOrigin, 'content-type': 'application/json' },
    body: '{}',
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: `Falta la cabecera ${MUTATION_HEADER}` })
})

test('trusted JSON mutations with the guard header are accepted', async () => {
  const response = await fetch(`${baseUrl}/resource`, {
    method: 'POST',
    headers: {
      origin: trustedOrigin,
      'content-type': 'application/json',
      [MUTATION_HEADER]: MUTATION_HEADER_VALUE,
    },
    body: '{}',
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), trustedOrigin)
  assert.deepEqual(await response.json(), { ok: true })
})

test('cross-site mutations without an Origin are rejected', async () => {
  const response = await fetch(`${baseUrl}/resource`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'cross-site',
      [MUTATION_HEADER]: MUTATION_HEADER_VALUE,
    },
    body: '{}',
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'Solicitud cross-site rechazada' })
})

test('mutations with a body reject form-compatible content types', async () => {
  const response = await fetch(`${baseUrl}/resource`, {
    method: 'POST',
    headers: {
      origin: trustedOrigin,
      'content-type': 'application/x-www-form-urlencoded',
      [MUTATION_HEADER]: MUTATION_HEADER_VALUE,
    },
    body: 'value=unsafe',
  })

  assert.equal(response.status, 415)
})
