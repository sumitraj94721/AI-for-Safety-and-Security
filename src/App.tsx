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

/* ===== Alert Sound Generator (Web Audio API — no external file needed) ===== */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
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

  const [status, setStatus] = useState<Status>('idle')
  const [detection, setDetection] = useState<DetectionResult | null>(null)
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

  /* ---- Detection loop ---- */
  const detectFaces = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.paused || video.ended) return

    const displaySize = { width: video.videoWidth, height: video.videoHeight }
    faceapi.matchDimensions(canvas, displaySize)

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceExpressions()

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    if (detections.length > 0) {
      const resized = faceapi.resizeResults(detections, displaySize)

      // Draw custom bounding boxes
      resized.forEach((det) => {
        if (!ctx) return
        const { x, y, width, height } = det.detection.box

        // Find dominant expression
        const expressions = det.expressions as any
        const sorted = Object.entries(expressions).sort(
          (a: any, b: any) => b[1] - a[1]
        )
        const [topEmotion, topConfidence] = sorted[0] as [string, number]
        const isThreat = topEmotion === 'angry' || topEmotion === 'sad'

        // Box color
        const boxColor = isThreat ? '#ef4444' : '#22c55e'

        // Draw rounded box
        ctx.strokeStyle = boxColor
        ctx.lineWidth = 2.5
        ctx.shadowColor = boxColor
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.roundRect(x, y, width, height, 6)
        ctx.stroke()
        ctx.shadowBlur = 0

        // Label background
        const label = `${EMOTION_EMOJI[topEmotion] || ''} ${topEmotion} (${Math.round(topConfidence * 100)}%)`
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

      // Use first face for status
      const firstExpressions = detections[0].expressions as any
      const sorted = Object.entries(firstExpressions).sort(
        (a: any, b: any) => b[1] - a[1]
      )
      const [emotion, confidence] = sorted[0] as [string, number]
      const isThreat = emotion === 'angry' || emotion === 'sad'

      setDetection({
        emotion,
        confidence,
        threatLevel: isThreat ? 'threat' : 'safe',
      })

      // Play alert sound (throttled to once every 2 seconds)
      if (isThreat && Date.now() - lastAlertRef.current > 2000) {
        playAlertSound()
        lastAlertRef.current = Date.now()
      }
    } else {
      setDetection(null)
    }

    animationRef.current = requestAnimationFrame(detectFaces)
  }, [])

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
      detectFaces()
    }

    video.addEventListener('playing', onPlay)

    // If already playing, start detection
    if (!video.paused) {
      detectFaces()
    }

    return () => {
      video.removeEventListener('playing', onPlay)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [status, detectFaces])

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

  /* ===== Render ===== */
  const threatLevel = detection?.threatLevel ?? 'none'
  const videoWrapperClass = `video-wrapper ${
    threatLevel === 'threat' ? 'threat' : threatLevel === 'safe' ? 'safe' : ''
  }`

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
          {detection && (
            <div
              className={`threat-banner ${
                detection.threatLevel === 'threat' ? 'danger' : 'safe'
              }`}
            >
              {detection.threatLevel === 'threat'
                ? '🚨  THREAT DETECTED — Hostile emotion identified'
                : '✅  SAFE — No threats detected'}
            </div>
          )}

          {!detection && (
            <div className="threat-banner safe" style={{ opacity: 0.5 }}>
              👤  Searching for face…
            </div>
          )}

          {/* Dashboard Cards */}
          <div className="dashboard">
            <div className="status-card">
              <div className="card-label">Status</div>
              <div
                className={`card-value ${
                  detection
                    ? detection.threatLevel === 'threat'
                      ? 'threat'
                      : 'safe'
                    : 'no-face'
                }`}
              >
                {detection
                  ? detection.threatLevel === 'threat'
                    ? '⚠ THREAT'
                    : '● SAFE'
                  : '—'}
              </div>
            </div>

            <div className="status-card">
              <div className="card-label">Emotion</div>
              <div
                className={`card-value ${detection ? 'emotion' : 'no-face'}`}
              >
                {detection
                  ? `${EMOTION_EMOJI[detection.emotion] || ''} ${detection.emotion}`
                  : 'No face'}
              </div>
            </div>

            <div className="status-card">
              <div className="card-label">Confidence</div>
              <div
                className={`card-value ${detection ? 'emotion' : 'no-face'}`}
              >
                {detection
                  ? `${Math.round(detection.confidence * 100)}%`
                  : '—'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="app-footer">
        AI Threat Detection System · Powered by face-api.js
      </footer>
    </div>
  )
}
