import fp from 'fastify-plugin'
import mongoose from 'mongoose'

export default fp(async (app) => {
  const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/travelexpenses'

  await mongoose.connect(uri)
  app.log.info('MongoDB connected')

  app.addHook('onClose', async () => {
    await mongoose.disconnect()
  })
})
