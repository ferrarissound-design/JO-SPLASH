import * as THREE from 'three';
import { getCharacterConfig } from '../entities/PlayerAppearance.js';

// ============================================================================
// CharacterPreview — lightweight title-screen showcase renderer.
// It owns a tiny secondary WebGL canvas and only renders while that canvas is
// visible. Gameplay models and stats remain completely independent.
// ============================================================================
export class CharacterPreview {
  constructor(canvas, { lowQuality = false } = {}) {
    if (!canvas) throw new Error('Character preview canvas was not found.');

    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20);
    this.camera.position.set(0, 1.15, 4.35);
    this.camera.lookAt(0, 1.02, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !lowQuality,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : 1.5));
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const ambient = new THREE.HemisphereLight(0xc8fbff, 0x091226, 1.65);
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-2.5, 4, 3.5);
    const rim = new THREE.DirectionalLight(0x36fff2, 1.25);
    rim.position.set(3, 2, -2.5);
    this.scene.add(ambient, key, rim);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x12334a,
      emissive: 0x18c6c0,
      emissiveIntensity: 0.58,
      roughness: 0.35,
      metalness: 0.45,
    });
    this.platformRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.035, 6, 32),
      ringMaterial,
    );
    this.platformRing.rotation.x = Math.PI / 2;
    this.platformRing.position.y = 0.025;
    this.scene.add(this.platformRing);

    this.characterId = null;
    this.model = null;
    this.materials = [];
    this._width = 0;
    this._height = 0;
  }

  setCharacter(characterId) {
    const config = getCharacterConfig(characterId);
    if (this.characterId === config.id) return;

    this._disposeModel();
    const { group, materials } = config.createModel();
    this.characterId = config.id;
    this.model = group;
    this.materials = materials;
    this.model.position.y = 0.04;
    this.model.rotation.y = 0.28;
    this.scene.add(this.model);
  }

  update(elapsedTime) {
    if (!this.model || this.canvas.offsetWidth <= 0 || this.canvas.offsetHeight <= 0) return;

    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    if (width !== this._width || height !== this._height) {
      this._width = width;
      this._height = height;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    this.model.rotation.y = 0.28 + elapsedTime * 0.42;
    const parts = this.model.userData.appearanceParts;
    if (parts?.motionRoot) parts.motionRoot.position.y = Math.sin(elapsedTime * 2.2) * 0.018;
    if (parts?.finL && parts?.finR) {
      const flutter = Math.sin(elapsedTime * 2.8) * 0.07;
      parts.finL.rotation.z = -0.2 - flutter;
      parts.finR.rotation.z = 0.2 + flutter;
    }
    this.platformRing.rotation.z = elapsedTime * 0.24;
    this.renderer.render(this.scene, this.camera);
  }

  _disposeModel() {
    if (!this.model) return;
    this.scene.remove(this.model);
    for (const geometry of this.model.userData.ownedGeometries ?? []) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.model = null;
    this.materials = [];
  }

  dispose() {
    this._disposeModel();
    this.platformRing.geometry.dispose();
    this.platformRing.material.dispose();
    this.renderer.dispose();
  }
}
