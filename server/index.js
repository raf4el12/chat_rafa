import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

const port = process.env.PORT ?? 3000
const app = express()
const server = createServer(app)
const io = new Server(server, {
  connectionStateRecovery: {}
})

const db = createClient({
  url: "libsql://stirring-firedrake-rafadev.aws-us-east-1.turso.io",
  authToken: process.env.DB_TOKEN
})

// FUNCION QUE EJECUTA LA TABLA SI ES QUE NO EXISTE
await db.execute(`
  CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`)

io.on('connection', async (socket) => {
  console.log('a user has connected!')

  socket.on('disconnect', () => {
    console.log('a user has disconnected')
  })

  // SE CREA UN EVENTO AL RECIBIR UN NUEVO MENSAJE
  socket.on('chat message', async ({ username, content }) => {
    try {
      const result = await db.execute({
        sql: 'INSERT INTO messages (content, user) VALUES (?, ?)',
        args: [content, username]
      })
  
      io.emit('chat message', content, result.lastInsertRowid.toString(), username)
    } catch (err) {
      console.error('Error al insertar el mensaje:', err)
    }
  })
  

  // ENVIA MENSAJES ANTERIORES AL NUEVO USUARIO QUE SE CONECTE AL SERVIDOR 
  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: 'SELECT id, content, user FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      })

      results.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id.toString(), row.user)
      })
    } catch (e) {
      console.error('Error al recuperar mensajes previos:', e)
    }
  }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
