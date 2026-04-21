import { useRef, useState, useEffect, useCallback } from 'react'
import * as faceapi from 'face-api.js'

/* ===== Types ===== */
type Status = 'idle' | 'loading' | 'running' | 'error'
type ThreatLevel = 'safe' | 'threat' | 'none'

interface DetectionResult {
  emotion: string
  confidence: number
  threatLevel: ThreatLevel
}

interface FaceDetectionResult extends DetectionResult {
  faceIndex: number
  box: { x: number; y: number; width: number; height: number }
}

/* ===== Emotion Stabilization Helpers ===== */
const HISTORY_LENGTH = 5

/** Majority-vote: returns the most frequent emotion in the history array */
function getStableEmotion(history: string[]): string {
  if (history.length === 0) return 'neutral'
  const counts: Record<string, number> = {}
  for (const e of history) {
    counts[e] = (counts[e] || 0) + 1
  }
  let best = history[0]
  let bestCount = 0
  for (const [emotion, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count
      best = emotion
    }
  }
  return best
}

/* ===== Alert Sound Generator (Web Audio API) ===== */
let audioCtx: AudioContext | null = null

function playAlertSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    const ctx = audioCtx
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.3)

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.5)
  } catch {
    // Audio not supported — fail silently
  }
}

/* ===== Emoji Map ===== */
const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  disgusted: '🤢',
  fearful: '😨',
  surprised: '😲',
  neutral: '😐',
}

/* ===== Main App Component ===== */
export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  const lastAlertRef = useRef<number>(0)
  const lastDetectionTimeRef = useRef<number>(0)
  const lastEmotionUpdateTimeRef = useRef<number>(0)
  const isDetectingRef = useRef<boolean>(false)
  const latestResultsRef = useRef<FaceDetectionResult[]>([])

  /** Per-face emotion history: Map<faceIndex, emotion[]> */
  const emotionHistoryRef = useRef<Map<number, string[]>>(new Map())

  const [status, setStatus] = useState<Status>('idle')
  const [faceDetections, setFaceDetections] = useState<FaceDetectionResult[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  /* ---- Load face-api.js models ---- */
  const loadModels = useCallback(async () => {
    const MODEL_URL = '/models'
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ])
  }, [])

  /* ---- Start camera stream ---- */
  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 720, height: 540, facingMode: 'user' },
    })
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [])

  /* ---- Detection logic (separated from render) ---- */
  const runDetection = useCallback(async (video: HTMLVideoElement, displaySize: { width: number, height: number }, currentTime: number) => {
    try {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceExpressions()

      const historyMap = emotionHistoryRef.current
      const activeFaceCount = detections.length

      for (const key of historyMap.keys()) {
        if (key >= activeFaceCount) {
          historyMap.delete(key)
        }
      }

      if (detections.length > 0) {
        const resized = faceapi.resizeResults(detections, displaySize)
        const results: FaceDetectionResult[] = []
        let anyThreat = false

        resized.forEach((det, faceIndex) => {
          const { x, y, width, height } = det.detection.box
          const expressions = det.expressions as any
          const sorted = Object.entries(expressions).sort((a: any, b: any) => b[1] - a[1])
          const [rawEmotion, rawConfidence] = sorted[0] as [string, number]

          if (!historyMap.has(faceIndex)) {
            historyMap.set(faceIndex, [])
          }
          const history = historyMap.get(faceIndex)!
          history.push(rawEmotion)
          if (history.length > HISTORY_LENGTH) {
            history.shift()
          }
          const stableEmotion = getStableEmotion(history)
          const stableConfidence =
            stableEmotion === rawEmotion
              ? rawConfidence
              : (expressions[stableEmotion] as number) ?? rawConfidence

          const isThreat = stableEmotion === 'angry' || stableEmotion === 'sad'
          if (isThreat) anyThreat = true

          results.push({
            faceIndex,
            emotion: stableEmotion,
            confidence: stableConfidence,
            threatLevel: isThreat ? 'threat' : 'safe',
            box: { x, y, width, height }
          })
        })

        latestResultsRef.current = results

        if (currentTime - lastEmotionUpdateTimeRef.current > 500) {
          setFaceDetections(results)
          lastEmotionUpdateTimeRef.current = currentTime
        }

        if (anyThreat && currentTime - lastAlertRef.current > 2000) {
          playAlertSound()
          lastAlertRef.current = currentTime
        }
      } else {
        latestResultsRef.current = []
        if (currentTime - lastEmotionUpdateTimeRef.current > 500) {
          setFaceDetections([])
          lastEmotionUpdateTimeRef.current = currentTime
        }
      }
    } catch (err) {
      console.error('Detection error:', err)
    } finally {
      isDetectingRef.current = false
    }
  }, [])

  /* ---- Render loop (UI/Canvas) ---- */
  const renderLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.paused || video.ended || video.readyState !== 4) {
      animationRef.current = requestAnimationFrame(renderLoop)
      return
    }

    const displaySize = { width: video.videoWidth, height: video.videoHeight }

    if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
      faceapi.matchDimensions(canvas, displaySize)
    }

    const currentTime = Date.now()

    if (currentTime - lastDetectionTimeRef.current > 100 && !isDetectingRef.current) {
      isDetectingRef.current = true
      lastDetectionTimeRef.current = currentTime
      runDetection(video, displaySize, currentTime)
    }

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const results = latestResultsRef.current

      results.forEach((face) => {
        const { x, y, width, height } = face.box
        const isThreat = face.threatLevel === 'threat'
        const boxColor = isThreat ? '#ef4444' : '#22c55e'

        ctx.strokeStyle = boxColor
        ctx.lineWidth = 2.5
        ctx.shadowColor = boxColor
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.roundRect(x, y, width, height, 6)
        ctx.stroke()
        ctx.shadowBlur = 0

        const emoji = EMOTION_EMOJI[face.emotion] || ''
        const label = `#${face.faceIndex + 1}  ${emoji} ${face.emotion} (${Math.round(face.confidence * 100)}%)`
        ctx.font = '600 14px Inter, sans-serif'
        const textWidth = ctx.measureText(label).width
        const labelHeight = 24
        const labelY = y > labelHeight + 4 ? y - labelHeight - 4 : y + height + 4

        ctx.fillStyle = boxColor
        ctx.beginPath()
        ctx.roundRect(x, labelY, textWidth + 16, labelHeight, 4)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, x + 8, labelY + 16)
      })
    }

    animationRef.current = requestAnimationFrame(renderLoop)
  }, [runDetection])

  /* ---- Handle Start button ---- */
  const handleStart = async () => {
    try {
      setStatus('loading')
      setErrorMsg('')

      await loadModels()
      await startCamera()

      setStatus('running')
    } catch (err: any) {
      console.error('Startup error:', err)
      setErrorMsg(err?.message || 'Failed to start. Check camera permissions.')
      setStatus('error')
    }
  }

  /* ---- Start detection when video plays ---- */
  useEffect(() => {
    const video = videoRef.current
    if (!video || status !== 'running') return

    const onPlay = () => {
      renderLoop()
    }

    video.addEventListener('playing', onPlay)

    // If already playing, start detection
    if (!video.paused) {
      renderLoop()
    }

    return () => {
      video.removeEventListener('playing', onPlay)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [status, renderLoop])

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      const video = videoRef.current
      if (video?.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks()
        tracks.forEach((t) => t.stop())
      }
    }
  }, [])

  /* ===== Derived State ===== */
  const hasFaces = faceDetections.length > 0
  const hasAnyThreat = faceDetections.some((d) => d.threatLevel === 'threat')
  const primaryDetection: DetectionResult | null = hasFaces
    ? {
      emotion: faceDetections[0].emotion,
      confidence: faceDetections[0].confidence,
      threatLevel: faceDetections[0].threatLevel,
    }
    : null

  const threatLevel = hasAnyThreat ? 'threat' : hasFaces ? 'safe' : 'none'
  const videoWrapperClass = `video-wrapper ${threatLevel === 'threat' ? 'threat' : threatLevel === 'safe' ? 'safe' : ''
    }`

  /* ===== Render ===== */
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">AI Threat Detection</h1>
        <p className="app-subtitle">
          Real-time face &amp; emotion analysis powered by AI
        </p>
      </header>

      {/* Start Button — visible when idle or error */}
      {(status === 'idle' || status === 'error') && (
        <>
          <button
            id="start-camera-btn"
            className="start-btn"
            onClick={handleStart}
          >
            <span className="btn-icon">📷</span>
            Start Camera
          </button>
          {status === 'error' && (
            <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {errorMsg}
            </p>
          )}
        </>
      )}

      {/* Loading State */}
      {status === 'loading' && (
        <div className="loading-section">
          <div className="spinner" />
          <p className="loading-text">Loading AI models &amp; camera…</p>
        </div>
      )}

      {/* Video Feed + Canvas Overlay */}
      {(status === 'running' || status === 'loading') && (
        <div className={videoWrapperClass}>
          <video
            ref={videoRef}
            className="video-feed"
            autoPlay
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="detection-canvas" />
        </div>
      )}

      {/* Status Dashboard */}
      {status === 'running' && (
        <>
          {/* Threat Banner */}
          {hasFaces && (
            <div
              className={`threat-banner ${hasAnyThreat ? 'danger' : 'safe'}`}
            >
              {hasAnyThreat
                ? `🚨  THREAT DETECTED — ${faceDetections.filter((d) => d.threatLevel === 'threat').length} hostile face(s) identified`
                : `✅  SAFE — ${faceDetections.length} face(s) detected, no threats`}
            </div>
          )}

          {!hasFaces && (
            <div className="threat-banner safe" style={{ opacity: 0.5 }}>
              👤  Searching for face…
            </div>
          )}

          {/* Face count indicator */}
          {hasFaces && (
            <div className="face-count-badge">
              👥 {faceDetections.length} face{faceDetections.length > 1 ? 's' : ''} detected
            </div>
          )}

          {/* Dashboard Cards — Primary face summary */}
          <div className="dashboard">
            <div className="status-card">
              <div className="card-label">Status</div>
              <div
                className={`card-value ${hasFaces
                  ? hasAnyThreat
                    ? 'threat'
                    : 'safe'
                  : 'no-face'
                  }`}
              >
                {hasFaces
                  ? hasAnyThreat
                    ? '⚠ THREAT'
                    : '● SAFE'
                  : '—'}
              </div>
            </div>

            <div className="status-card">
              <div className="card-label">Faces</div>
              <div
                className={`card-value ${hasFaces ? 'emotion' : 'no-face'}`}
              >
                {hasFaces ? faceDetections.length : '0'}
              </div>
            </div>

            <div className="status-card">
              <div className="card-label">Primary Emotion</div>
              <div
                className={`card-value ${primaryDetection ? 'emotion' : 'no-face'}`}
              >
                {primaryDetection
                  ? `${EMOTION_EMOJI[primaryDetection.emotion] || ''} ${primaryDetection.emotion}`
                  : 'No face'}
              </div>
            </div>
          </div>

          {/* Per-face emotion grid (shown when more than 1 face) */}
          {faceDetections.length > 0 && (
            <div className="face-grid">
              {faceDetections.map((face) => {
                const isThreat = face.threatLevel === 'threat'
                return (
                  <div
                    key={face.faceIndex}
                    className={`face-card ${isThreat ? 'face-card-threat' : 'face-card-safe'}`}
                  >
                    <div className="face-card-index">Face #{face.faceIndex + 1}</div>
                    <div className="face-card-emotion">
                      {EMOTION_EMOJI[face.emotion] || ''} {face.emotion}
                    </div>
                    <div className="face-card-confidence">
                      {Math.round(face.confidence * 100)}%
                    </div>
                    {isThreat && <div className="face-card-alert">⚠ THREAT</div>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <footer className="app-footer">
        AI Threat Detection System · Powered by face-api.js
      </footer>
    </div>
  )
}

