import { useState, useRef, useEffect } from 'react'
import './App.css'

const STEPS = [0.1, 3, 5, 10, 20, 30, null]
const STEP_LABELS = ['0,1s', '3s', '5s', '10s', '20s', '30s', 'Komplett']

const CATEGORIES = [
  { id: 'all',        label: 'Alle',          emoji: '🎵' },
  { id: 'rap',        label: 'Rap / Hip-Hop', emoji: '🎤' },
  { id: 'pop',        label: 'Pop',           emoji: '⭐' },
  { id: 'rock',       label: 'Rock',          emoji: '🎸' },
  { id: 'electronic', label: 'Electronic',    emoji: '🎧' },
  { id: 'rnb',        label: 'R&B / Soul',    emoji: '🎶' },
  { id: 'latin',      label: 'Latin',         emoji: '💃' },
  { id: 'indie',      label: 'Indie',         emoji: '🌿' },
  { id: 'metal',      label: 'Metal',         emoji: '🤘' },
  { id: 'country',    label: 'Country',       emoji: '🤠' },
  { id: 'techno',     label: 'Techno',        emoji: '🎛️' },
  { id: 'schlager',   label: 'Malle / Schlager', emoji: '🍺' },
]

export default function App() {
  const [track, setTrack] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stepIndex, setStepIndex] = useState(0)
  const [guesses, setGuesses] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [gameOver, setGameOver] = useState(null) // 'won' | 'lost' | null
  const [playbackPos, setPlaybackPos] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [category, setCategory] = useState('all')
  const [feedback, setFeedback] = useState(null) // 'wrong' | null — kurze Einblendung

  const audioRef = useRef(null)
  const searchTimeout = useRef(null)
  const searchRef = useRef(null)

  const currentDuration = STEPS[stepIndex] ?? 30

  async function loadTrack(cat) {
    const usedCat = cat ?? category
    setLoading(true)
    setStepIndex(0)
    setGuesses([])
    setGameOver(null)
    setFeedback(null)
    setSearchQuery('')
    setSearchResults([])
    setPlaybackPos(0)
    setIsPlaying(false)
    try {
      const res = await fetch(`/api/random-track?genre=${usedCat}`)
      const data = await res.json()
      setTrack(data.previewUrl ? data : null)
    } catch {
      setTrack(null)
    }
    setLoading(false)
  }

  useEffect(() => { loadTrack() }, [])

  // Suche mit Debounce
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!searchQuery.trim()) { setSearchResults([]); setSelectedIndex(-1); return }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
        setSearchResults(await res.json())
        setSelectedIndex(-1)
      } catch { setSearchResults([]) }
    }, 300)
    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery])

  // Audio laden wenn Track sich ändert
  useEffect(() => {
    if (!audioRef.current || !track?.previewUrl) return
    const audio = audioRef.current
    audio.pause()
    audio.src = track.previewUrl
    audio.load()
    setIsPlaying(false)
    setPlaybackPos(0)
  }, [track])

  const fullPlayRef = useRef(false)

  // Auto-Stop nach currentDuration
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    function onTimeUpdate() {
      setPlaybackPos(audio.currentTime)
      if (!fullPlayRef.current && audio.currentTime >= currentDuration) {
        audio.pause()
        audio.currentTime = 0
        setIsPlaying(false)
        setPlaybackPos(0)
      }
    }
    function onEnded() { setIsPlaying(false); setPlaybackPos(0); fullPlayRef.current = false }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [currentDuration])

  async function playClip(full = false) {
    if (!audioRef.current || !track?.previewUrl) return
    fullPlayRef.current = full
    const audio = audioRef.current
    audio.currentTime = 0
    setPlaybackPos(0)
    try {
      await audio.play()
      setIsPlaying(true)
    } catch (err) {
      console.error('Playback error:', err)
      setIsPlaying(false)
    }
  }

  function advanceStep(newGuesses) {
    const nextStep = stepIndex + 1
    if (nextStep < STEPS.length) {
      setStepIndex(nextStep)
    } else {
      // Letzter Schritt war auch falsch → verloren
      setGameOver('lost')
    }
  }

  function handleGuess(result) {
    if (!result || gameOver) return
    const correct =
      result.id === track.id ||
      result.name.toLowerCase() === track.name.toLowerCase()

    const newGuess = { text: `${result.name} – ${result.artists.join(', ')}`, correct, skipped: false }
    const newGuesses = [...guesses, newGuess]
    setGuesses(newGuesses)
    setSearchQuery('')
    setSearchResults([])

    if (correct) {
      setGameOver('won')
    } else {
      // Kurzes "Falsch!"-Feedback, dann nächster Schritt
      setFeedback('wrong')
      setTimeout(() => {
        setFeedback(null)
        advanceStep(newGuesses)
      }, 1200)
    }
  }

  function handleSkip() {
    if (gameOver || feedback) return
    const newGuess = { text: 'Übersprungen', correct: false, skipped: true }
    const newGuesses = [...guesses, newGuess]
    setGuesses(newGuesses)
    setSearchQuery('')
    setSearchResults([])
    advanceStep(newGuesses)
  }

  function handleKeyDown(e) {
    if (searchResults.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      handleGuess(selectedIndex >= 0 ? searchResults[selectedIndex] : searchResults[0])
    }
  }

  const progressPercent = isPlaying ? Math.min((playbackPos / currentDuration) * 100, 100) : 0

  return (
    <div className="app">
      <header>
        <h1>Heardle</h1>
        <p className="subtitle">Erkenne das Lied!</p>
      </header>

      {/* Kategorie-Auswahl */}
      <div className="categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`cat-btn ${category === c.id ? 'active' : ''}`}
            onClick={() => { setCategory(c.id); loadTrack(c.id) }}
          >
            <span className="cat-emoji">{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Lade Lied...</div>
      ) : !track ? (
        <div className="error">
          <p>Kein Lied gefunden. Versuch es nochmal.</p>
          <button onClick={() => loadTrack()}>Erneut versuchen</button>
        </div>
      ) : (
        <main>
          {/* Schritt-Anzeige */}
          <div className="steps">
            {STEPS.map((_, i) => {
              const g = guesses[i]
              const state =
                i < guesses.length
                  ? g?.correct ? 'correct' : g?.skipped ? 'skipped' : 'wrong'
                  : i === stepIndex ? 'active' : 'future'
              return (
                <div key={i} className={`step step--${state}`} title={STEP_LABELS[i]}>
                  {state === 'correct' ? '✓' : state === 'wrong' ? '✗' : state === 'skipped' ? '→' : STEP_LABELS[i]}
                </div>
              )
            })}
          </div>

          {/* Feedback-Einblendung */}
          {feedback === 'wrong' && (
            <div className="feedback-banner wrong">✗ Falsch! Nächster Ausschnitt...</div>
          )}

          {/* Play-Button + Fortschrittsbalken */}
          <div className="player">
            <button
              className={`play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={playClip}
              disabled={!!gameOver || feedback === 'wrong'}
              title="Ausschnitt abspielen"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="duration-label">
              {STEPS[stepIndex] === null ? '30s' : `${STEPS[stepIndex]}s`}
            </span>
          </div>

          {/* Errate-Liste */}
          <div className="guesses">
            {guesses.map((g, i) => (
              <div key={i} className={`guess ${g.correct ? 'correct' : g.skipped ? 'skipped' : 'wrong'}`}>
                {g.correct ? '✓' : g.skipped ? '→' : '✗'} {g.text}
              </div>
            ))}
          </div>

          {/* Eingabe */}
          {!gameOver && (
            <div className="input-area">
              <div className="search-wrapper">
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Titel oder Interpret eingeben..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  disabled={feedback === 'wrong'}
                />
                {searchResults.length > 0 && !feedback && (
                  <ul className="dropdown">
                    {searchResults.map((r, i) => (
                      <li
                        key={r.id}
                        className={i === selectedIndex ? 'selected' : ''}
                        onMouseDown={() => handleGuess(r)}
                        onMouseEnter={() => setSelectedIndex(i)}
                      >
                        {r.coverUrl && <img src={r.coverUrl} alt="" />}
                        <span className="result-title">{r.name}</span>
                        <span className="result-artist">{r.artists.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="input-buttons">
                <button
                  className="skip-btn"
                  onClick={handleSkip}
                  disabled={feedback === 'wrong'}
                  title="Überspringen – nächsten Ausschnitt hören"
                >
                  Überspringen →
                </button>
                <button
                  className="give-up-btn"
                  onClick={() => setGameOver('lost')}
                  disabled={feedback === 'wrong'}
                  title="Aufgeben – Lösung anzeigen"
                >
                  Aufgeben
                </button>
              </div>
            </div>
          )}

          {/* Ergebnis-Banner */}
          {gameOver && (
            <div className={`result-banner ${gameOver}`}>
              {gameOver === 'won' ? (
                <>
                  <div className="result-icon">🎉</div>
                  <p>
                    Richtig! <strong>{track.name}</strong> von{' '}
                    <strong>{track.artists.join(', ')}</strong>
                    {guesses.length === 1 ? ' — beim ersten Versuch!' : ` — nach ${guesses.filter(g => !g.skipped).length} Versuchen.`}
                  </p>
                </>
              ) : (
                <>
                  <div className="result-icon">😔</div>
                  <p>
                    Das Lied war: <strong>{track.name}</strong> von{' '}
                    <strong>{track.artists.join(', ')}</strong>
                  </p>
                </>
              )}
              {track.coverUrl && <img className="cover" src={track.coverUrl} alt={track.name} />}
              <div className="result-actions">
                <button className="play-again-btn" onClick={() => playClip(true)}>
                  ▶ Nochmal anhören
                </button>
                <button className="new-game-btn" onClick={() => loadTrack()}>
                  Neues Lied
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      <audio ref={audioRef} preload="auto" />
    </div>
  )
}
