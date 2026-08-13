import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health/live', (_req, res) => res.json({status:'ok'}))
app.get('/health/ready', (_req, res) => res.json({status:'ok', db:'unknown', redis:'unknown'}))

app.get('/', (_req, res) => res.send('TakeProp API (development)'))

const port = process.env.PORT || 3000
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${port}`)
})
