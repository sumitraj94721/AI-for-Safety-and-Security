import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

export default function CameraModule() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [started, setStarted] = useState(false);

    // ------------------ LOAD MODELS ------------------
    const loadModels = async () => {
        const MODEL_URL = "/models";

        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
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
        const run = async () => {
            if (
                videoRef.current &&
                videoRef.current.readyState === 4 &&
                canvasRef.current
            ) {
                const detections = await faceapi
                    .detectAllFaces(
                        videoRef.current,
                        new faceapi.TinyFaceDetectorOptions({ inputSize: 320 })
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

                resized.forEach((res) => {
                    const box = res.detection.box;

                    // BOX
                    ctx!.strokeStyle = "cyan";
                    ctx!.lineWidth = 2;
                    ctx!.strokeRect(box.x, box.y, box.width, box.height);

                    // EMOTION
                    const expressions = res.expressions;
                    const emotion = Object.keys(expressions).reduce((a, b) =>
                        expressions[a] > expressions[b] ? a : b
                    );

                    ctx!.fillStyle = "black";
                    ctx!.fillRect(box.x, box.y - 25, box.width, 25);

                    ctx!.fillStyle = "white";
                    ctx!.font = "16px Arial";
                    ctx!.fillText(emotion.toUpperCase(), box.x + 5, box.y - 7);
                });
            }

            requestAnimationFrame(run);
        };

        run();
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
        <div style={{ textAlign: "center" }}>
            {!started && (
                <button onClick={startCamera}>Start Camera</button>
            )}

            <div style={{ position: "relative", marginTop: "10px" }}>
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    width="640"
                    height="480"
                    style={{ borderRadius: "10px" }}
                />

                <canvas
                    ref={canvasRef}
                    width="640"
                    height="480"
                    style={{
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                    }}
                />
            </div>
        </div>
    );
}