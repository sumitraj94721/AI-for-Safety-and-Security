export type ThreatLevel = 'SAFE' | 'MEDIUM' | 'HIGH';
export type Role = 'ADMIN' | 'INTRUDER';

export interface FaceData {
  id: string;
  box: { x: number; y: number; width: number; height: number };
  emotion: string;
  role: Role;
  staringTime: number;
  threatScore: number;
  isStaring: boolean;
  isFastMoving: boolean;
  isSuspiciousMotion: boolean;
}

export interface SystemStatus {
  cameraBlocked: boolean;
  noFaceDetected: boolean;
  weaponDetected: boolean;
  activeThreatLevel: ThreatLevel;
}

export const getEmotionEmoji = (emotion: string) => {
  const map: Record<string, string> = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    fearful: '😨',
    disgusted: '🤢',
    surprised: '😲',
    neutral: '😐',
  };
  return map[emotion] || '😐';
};

// Simple ID generator for tracking
export const generateId = (index: number) => `Person ${index + 1}`;
