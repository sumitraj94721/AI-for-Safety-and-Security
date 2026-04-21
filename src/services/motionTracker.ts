interface FacePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  timestamp: number;
}

export class MotionTracker {
  private previousPositions: Map<number, FacePosition> = new Map();
  private staringStartTimes: Map<number, number> = new Map();
  private nextId = 0;

  private FAST_MOTION_THRESHOLD = 50; 
  private JUMP_THRESHOLD = 150; 
  private STARING_THRESHOLD_MS = 3000;
  private CENTER_TOLERANCE = 50; 

  // Basic tracking using position similarity
  public matchFace(box: { x: number; y: number; width: number; height: number }): number {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    let bestMatchId = -1;
    let minDistance = Infinity;

    for (const [id, pos] of this.previousPositions.entries()) {
      const dx = centerX - pos.centerX;
      const dy = centerY - pos.centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minDistance && distance < 200) { // Max tracking distance
        minDistance = distance;
        bestMatchId = id;
      }
    }

    if (bestMatchId !== -1) {
      return bestMatchId;
    }

    // New face
    const newId = this.nextId++;
    return newId;
  }

  public analyzeMotion(
    faceId: number,
    box: { x: number; y: number; width: number; height: number },
    videoWidth: number,
    videoHeight: number
  ) {
    const now = Date.now();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    const currentPos: FacePosition = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      centerX,
      centerY,
      timestamp: now,
    };

    let isFastMoving = false;
    let isSuspiciousMotion = false;
    let isStaring = false;

    const prevPos = this.previousPositions.get(faceId);

    if (prevPos) {
      const dx = currentPos.centerX - prevPos.centerX;
      const dy = currentPos.centerY - prevPos.centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const timeDiff = now - prevPos.timestamp;
      const speed = distance / (timeDiff > 0 ? timeDiff : 1) * 33; 

      if (speed > this.JUMP_THRESHOLD) {
        isSuspiciousMotion = true;
      } else if (speed > this.FAST_MOTION_THRESHOLD) {
        isFastMoving = true;
      }

      const distFromCenterCameraX = Math.abs(centerX - videoWidth / 2);
      const distFromCenterCameraY = Math.abs(centerY - videoHeight / 2);
      
      const isCentered = distFromCenterCameraX < videoWidth * 0.25 && distFromCenterCameraY < videoHeight * 0.25;
      const isStill = speed < 10;

      if (isCentered && isStill) {
        if (!this.staringStartTimes.has(faceId)) {
          this.staringStartTimes.set(faceId, now);
        } else {
          const staringDuration = now - this.staringStartTimes.get(faceId)!;
          if (staringDuration > this.STARING_THRESHOLD_MS) {
            isStaring = true;
          }
        }
      } else {
        this.staringStartTimes.delete(faceId);
      }
    }

    this.previousPositions.set(faceId, currentPos);

    return {
      isFastMoving,
      isSuspiciousMotion,
      isStaring,
    };
  }

  public cleanup(activeIds: Set<number>) {
    for (const key of Array.from(this.previousPositions.keys())) {
      if (!activeIds.has(key)) {
        this.previousPositions.delete(key);
        this.staringStartTimes.delete(key);
      }
    }
  }
}

export const motionTracker = new MotionTracker();
