// backend/src/config/db.js
import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB
  if (!uri) throw new Error('MONGODB_URI missing')
  if (!dbName) throw new Error('MONGODB_DB missing')

  const conn = await mongoose.connect(uri, {
    dbName,                         // <- DB adı burada
    autoIndex: true,
    serverSelectionTimeoutMS: 10000,
  })
  console.log('✅ Mongo connected:', conn.connection.name)
  return conn
}
