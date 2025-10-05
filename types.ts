// Fix: Import the 'three' library to provide the THREE namespace.
import * as THREE from 'three';

export interface Stats {
  bowlTemp: number;
  vaporCount: number;
  residueCount: number;
  pipeRotation: number;
  isHeating: boolean;
  isInhaling: boolean;
}

export interface SubtitleState {
  text: string;
  visible: boolean;
}

export interface Crystal {
  mesh: THREE.Mesh;
  state: 'solid' | 'liquid';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  temperature: number;
  size: number;
}

export interface VaporParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lifespan: number;
}