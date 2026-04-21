import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { motionTracker } from "../services/motionTracker";
import { objectDetector } from "../services/objectDetector";
import { threatEngine } from "../services/threatEngine";
import { FaceData, getEmotionEmoji, generateId, ThreatLevel } from "../utils/helpers";

export default function CameraModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [fps, setFps] = useState(0);
  const [enableThreatDetection, setEnableThreatDetection] = useState(true);
  const [globalThreatLevel, setGlobalThreatLevel] = useState<ThreatLevel>("SAFE");
  const [alertMessage, setAlertMessage] = useState("");
  
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const noFaceTimerRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Smoothing emotion histories
  const emotionHistoryRef = useRef<Map<number, string[]>>(new Map());

  // ------------------ LOAD MODELS ------------------
  const loadModels = async () => {
    const MODEL_URL = "/models";
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    await objectDetector.loadModel();
  };

  // ------------------ ALERT SOUND ------------------
  const playAlertSound = () => {
    if (!audioRef.current) {
      // Create a short beep sound using AudioContext if available
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
      } catch (e) {
        console.warn("AudioContext not supported");
      }
    }
  };

  // ------------------ START CAMERA ------------------
  const startCamera = async () => {
    try {
      await loadModels();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStarted(true);
      detect();
    } catch (err) {
      console.error("Camera error:", err);
      alert("Camera permission denied or not working");
    }
  };

  // ------------------ DETECTION LOOP ------------------
  const detect = () => {
    let animationFrameId: number;
    let frameSkipCount = 0;

    const run = async () => {
      // FPS Counter
      frameCountRef.current++;
      const now = Date.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      if (
        videoRef.current &&
        videoRef.current.readyState === 4 &&
        canvasRef.current
      ) {
        // Skip every other frame for performance
        frameSkipCount++;
        if (frameSkipCount % 2 === 0) {
          const detections = await faceapi
            .detectAllFaces(
              videoRef.current,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }) // Lower resolution for performance
            )
            .withFaceExpressions();

          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");

          const displaySize = {
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight,
          };

          faceapi.matchDimensions(canvas, displaySize);
          const resized = faceapi.resizeResults(detections, displaySize);
          ctx?.clearRect(0, 0, canvas.width, canvas.height);

          let currentMaxThreat: ThreatLevel = "SAFE";
          let alertMsg = "";
          let weaponDetected = false;

          if (enableThreatDetection) {
            weaponDetected = await objectDetector.detectWeapons(videoRef.current);
            if (weaponDetected) {
              alertMsg = "🚨 WEAPON DETECTED";
              currentMaxThreat = "HIGH";
            }
          }

          // Camera Blocked Check (brightness / total black frame)
          // Simplified: If no faces detected for > 5 seconds, trigger NO PERSON alert
          if (resized.length === 0) {
            if (noFaceTimerRef.current === 0) noFaceTimerRef.current = now;
            else if (now - noFaceTimerRef.current > 5000) {
              alertMsg = "⚠ NO PERSON DETECTED / CAMERA BLOCKED";
              currentMaxThreat = "MEDIUM";
            }
          } else {
            noFaceTimerRef.current = 0; // Reset
          }

          const activeIds = new Set<number>();

          // Pre-process faces to get consistent IDs
          const trackedFaces = resized.map((res) => {
            const box = res.detection.box;
            const id = enableThreatDetection ? motionTracker.matchFace(box) : Math.floor(Math.random() * 1000);
            return { res, id, box };
          });

          trackedFaces.forEach(({ res, id, box }) => {
            activeIds.add(id);
            
            // Emotion Averaging (Stability)
            const expressions = res.expressions as any;
            const topEmotion = Object.keys(expressions).reduce((a, b) =>
              expressions[a] > expressions[b] ? a : b
            );
            
            if (!emotionHistoryRef.current.has(id)) emotionHistoryRef.current.set(id, []);
            const hist = emotionHistoryRef.current.get(id)!;
            hist.push(topEmotion);
            if (hist.length > 5) hist.shift();
            
            // Majority vote for emotion
            const counts = hist.reduce((acc, curr) => { acc[curr] = (acc[curr] || 0) + 1; return acc; }, {} as Record<string, number>);
            const stableEmotion = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

            // Motion Tracking
            const motionParams = enableThreatDetection ? motionTracker.analyzeMotion(id, box, displaySize.width, displaySize.height) : { isFastMoving: false, isSuspiciousMotion: false, isStaring: false };

            // Threat Scoring
            const role = threatEngine.determineRole(id);
            const threatScore = enableThreatDetection ? threatEngine.calculateThreatScore(
              stableEmotion,
              motionParams.isFastMoving,
              motionParams.isStaring,
              motionParams.isSuspiciousMotion,
              weaponDetected,
              role
            ) : 0;
            
            const threatLevel = threatEngine.getThreatLevel(threatScore);
            
            if (threatLevel === "HIGH") currentMaxThreat = "HIGH";
            else if (threatLevel === "MEDIUM" && currentMaxThreat !== "HIGH") currentMaxThreat = "MEDIUM";

            if (threatLevel === "HIGH" && !alertMsg) alertMsg = "🚨 THREAT DETECTED";

            // --- DRAW UI OVERLAY ---
            const boxColor = threatLevel === "HIGH" ? "red" : threatLevel === "MEDIUM" ? "orange" : role === "ADMIN" ? "lime" : "cyan";

            // Box
            ctx!.strokeStyle = boxColor;
            ctx!.lineWidth = threatLevel === "HIGH" ? 4 : 2;
            
            if (threatLevel === "HIGH") {
              ctx!.shadowColor = "red";
              ctx!.shadowBlur = 20;
            } else {
              ctx!.shadowBlur = 0;
            }
            ctx!.strokeRect(box.x, box.y, box.width, box.height);

            // Spotlight effect (darken rest, glow center)
            if (threatLevel === "HIGH" && id === 0) { // Using id 0 as primary spotlight target for example
               ctx!.fillStyle = "rgba(0, 0, 0, 0.4)";
               ctx!.fillRect(0, 0, canvas.width, canvas.height); // darken bg
               ctx!.clearRect(box.x, box.y, box.width, box.height); // clear for face
               ctx!.strokeRect(box.x, box.y, box.width, box.height); // redraw box
            }

            ctx!.shadowBlur = 0; // reset

            // Info Panel Background
            ctx!.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx!.fillRect(box.x, box.y - 70, box.width, 65);

            // Text Setup
            ctx!.fillStyle = "white";
            ctx!.font = "bold 14px Arial";
            
            // Line 1: Label + Role
            const label = generateId(id);
            ctx!.fillText(`${label} [${role}]`, box.x + 5, box.y - 50);
            
            // Line 2: Emotion
            const emoji = getEmotionEmoji(stableEmotion);
            ctx!.fillText(`${emoji} ${stableEmotion.toUpperCase()}`, box.x + 5, box.y - 30);
            
            // Line 3: Threat Status
            ctx!.fillStyle = boxColor;
            ctx!.fillText(`Threat: ${threatScore} (${threatLevel})`, box.x + 5, box.y - 10);

            // Motion Tags
            if (motionParams.isSuspiciousMotion) {
              ctx!.fillStyle = "red";
              ctx!.fillText("SUSPICIOUS MOTION", box.x + box.width + 5, box.y + 20);
            } else if (motionParams.isFastMoving) {
              ctx!.fillStyle = "orange";
              ctx!.fillText("FAST MOVEMENT", box.x + box.width + 5, box.y + 20);
            }
            
            if (motionParams.isStaring) {
              ctx!.fillStyle = "yellow";
              ctx!.fillText("STARING", box.x + box.width + 5, box.y + 40);
            }
          });

          if (enableThreatDetection) {
            motionTracker.cleanup(activeIds);
            // Cleanup emotion history for disappeared faces
            for (const key of Array.from(emotionHistoryRef.current.keys())) {
              if (!activeIds.has(key)) {
                emotionHistoryRef.current.delete(key);
              }
            }
          }

          if (currentMaxThreat === "HIGH" && globalThreatLevel !== "HIGH") {
            playAlertSound();
          }

          setGlobalThreatLevel(currentMaxThreat);
          setAlertMessage(alertMsg);
        }
      }

      animationFrameId = requestAnimationFrame(run);
    };

    run();
    
    return () => cancelAnimationFrame(animationFrameId);
  };

  // ------------------ CLEANUP ------------------
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  // ------------------ UI ------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", height: "100%" }}>
      {!started && (
        <button onClick={startCamera} style={{ padding: "10px 20px", fontSize: "16px", background: "var(--accent-blue)", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", margin: "auto" }}>
          Start Intelligent Surveillance
        </button>
      )}

      {started && (
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <div>FPS: {fps}</div>
          <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
            <input type="checkbox" checked={enableThreatDetection} onChange={(e) => setEnableThreatDetection(e.target.checked)} />
            Enable Threat Engine
          </label>
        </div>
      )}

      {alertMessage && started && (
        <div style={{
          width: "100%", padding: "10px", textAlign: "center", fontWeight: "bold", fontSize: "1.2rem",
          background: globalThreatLevel === "HIGH" ? "rgba(255,0,0,0.2)" : "rgba(255,165,0,0.2)",
          color: globalThreatLevel === "HIGH" ? "#ff4444" : "orange",
          border: `1px solid ${globalThreatLevel === "HIGH" ? "red" : "orange"}`,
          borderRadius: "5px", marginBottom: "10px",
          animation: globalThreatLevel === "HIGH" ? "pulse 1s infinite" : "none"
        }}>
          {alertMessage}
        </div>
      )}

      <div style={{ position: "relative", width: "100%", maxWidth: "640px", borderRadius: "10px", overflow: "hidden", display: started ? "block" : "none", boxShadow: globalThreatLevel === "HIGH" ? "0 0 30px rgba(255,0,0,0.5)" : "none", transition: "box-shadow 0.3s" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", display: "block" }}
        />

        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%"
          }}
        />
      </div>
    </div>
  );
}