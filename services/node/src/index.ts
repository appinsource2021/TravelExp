import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import fastifyCookie from '@fastify/cookie'
import mongoPlugin from './plugins/mongo'
import socketRegistryPlugin from './plugins/socket-registry'
import socketRoute from './routes/socket.route'
import authRoute from './routes/auth.route'
import travelRoute from './routes/travel.route'

const app = Fastify({ logger: true })

async function start() {
  await app.register(fastifyCors, {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  })
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? 'changeme',
  })
  await app.register(fastifyWebsocket)
  await app.register(mongoPlugin)
  await app.register(socketRegistryPlugin)
  await app.register(socketRoute)
  await app.register(authRoute, { prefix: '/api' })
  await app.register(travelRoute, { prefix: '/api' })

  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
}

start()
