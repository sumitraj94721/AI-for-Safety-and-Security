import { Role, ThreatLevel } from '../utils/helpers';

export class ThreatEngine {
  public calculateThreatScore(
    emotion: string,
    isFastMoving: boolean,
    isStaring: boolean,
    isSuspiciousMotion: boolean,
    weaponDetected: boolean,
    role: Role
  ): number {
    let score = 0;

    if (role === 'INTRUDER') {
      score += 10;
    }

    if (weaponDetected) {
      score += 50;
    }

    if (emotion === 'angry' || emotion === 'fearful' || emotion === 'disgusted') {
      score += 20;
    }

    if (isSuspiciousMotion) {
      score += 30;
    } else if (isFastMoving) {
      score += 20;
    }

    if (isStaring) {
      score += 10;
    }

    return score;
  }

  public getThreatLevel(score: number): ThreatLevel {
    if (score > 50) return 'HIGH';
    if (score > 30) return 'MEDIUM';
    return 'SAFE';
  }

  // Determine role. Basic heuristic: Person 1 (index 0) is usually Admin if we hardcode, 
  // but let's make index 0 ADMIN and others INTRUDER for this demo as "Known vs Unknown"
  public determineRole(faceIndex: number): Role {
    return faceIndex === 0 ? 'ADMIN' : 'INTRUDER';
  }
}

export const threatEngine = new ThreatEngine();
