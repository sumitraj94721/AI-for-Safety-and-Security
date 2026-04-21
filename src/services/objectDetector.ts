import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

export class ObjectDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  private isLoaded = false;
  private weaponLabels = ['knife', 'scissors', 'baseball bat', 'gun', 'sword']; // COCO doesn't explicitly have 'gun', but we can check related or similar, some versions might have it or we just add common dangerous ones. 'knife' is in COCO.

  public async loadModel() {
    if (this.isLoaded) return;
    try {
      this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      this.isLoaded = true;
      console.log('Object detection model loaded');
    } catch (error) {
      console.error('Failed to load object detection model', error);
    }
  }

  public async detectWeapons(videoElement: HTMLVideoElement): Promise<boolean> {
    if (!this.isLoaded || !this.model) return false;
    
    try {
      const predictions = await this.model.detect(videoElement);
      
      for (const pred of predictions) {
        if (pred.score > 0.4 && this.weaponLabels.includes(pred.class.toLowerCase())) {
          return true; // Weapon detected
        }
      }
    } catch (error) {
      // Ignore prediction errors (e.g., video not ready)
    }
    
    return false;
  }
}

export const objectDetector = new ObjectDetector();
