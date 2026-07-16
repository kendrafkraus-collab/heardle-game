import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import 'dotenv/config'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001

// Deezer Genre-IDs
const GENRE_IDS = {
  all:        [0],          // Alle
  rap:        [116],        // Rap/Hip-Hop
  pop:        [132],        // Pop
  rock:       [152],        // Rock
  electronic: [106],        // Electronic
  rnb:        [165],        // R&B
  latin:      [67],         // Latin
  indie:      [77],         // Alternative/Indie
  metal:      [464],        // Metal
  country:    [84],         // Country
}

// Spotify token für Suche (Suche bleibt Spotify, Audio kommt von Deezer)
let tokenCache = { token: null, expiresAt: 0 }

async function getSpotifyToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return data.access_token
}

// Zufälliger Track von Deezer (kein API-Key nötig)
app.get('/api/random-track', async (req, res) => {
  try {
    const genre = req.query.genre || 'all'
    const genreIds = GENRE_IDS[genre] || GENRE_IDS.all
    const genreId = genreIds[Math.floor(Math.random() * genreIds.length)]

    let track = null

    for (let attempt = 0; attempt < 6 && !track; attempt++) {
      // Deezer Chart für das Genre holen
      const url = genreId === 0
        ? `https://api.deezer.com/chart/0/tracks?limit=100`
        : `https://api.deezer.com/chart/${genreId}/tracks?limit=100`

      const chartRes = await fetch(url)
      const chartData = await chartRes.json()
      const candidates = (chartData.data || []).filter(t => t.preview)

      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)]
        track = {
          id: String(picked.id),
          name: picked.title,
          artists: [picked.artist.name],
          previewUrl: picked.preview,
          coverUrl: picked.album?.cover_big || picked.album?.cover || null,
        }
      }
    }

    if (!track) return res.status(404).json({ error: 'Kein Track mit Preview gefunden' })
    res.json(track)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

// Suche bleibt Spotify (bessere Ergebnisse)
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 1) return res.json([])
    const token = await getSpotifyToken()
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await searchRes.json()
    const results = (data.tracks?.items || []).map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => a.name),
      coverUrl: t.album?.images?.[2]?.url || null,
    }))
    res.json(results)
  } catch (err) {
    console.error(err)
    res.status(500).json([])
  }
})

app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`))
