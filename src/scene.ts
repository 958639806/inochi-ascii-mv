import * as THREE from 'three';
import { characterIdHash, createBodySamples, noise, sampleCharacterFrame } from './character';
import { assertOutputFrame, pilotTimeline } from './timeline';

export interface SceneEvidence {
  characterCount: number;
  characterIdHash: string;
  finite: boolean;
  renderer: string;
  cameraPosition: number[];
  bounds: { min: number[]; max: number[] };
}

export interface PilotScene {
  renderFrame(frame: number, seed: number): SceneEvidence;
  resize(width: number, height: number): void;
  dispose(): void;
}

const FONT_STACK = '"Cascadia Mono", Consolas, "Courier New", monospace';
const GLYPHS = '01:.;|/\\+-=*#@%[]{}<>()!?ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = Math.ceil(GLYPHS.length / ATLAS_COLUMNS);
const s01 = pilotTimeline.shots.find((shot) => shot.id === 'S01');
if (!s01) throw new Error('The pilot timeline must define S01.');
const S01_LAST_FRAME = s01.last_frame_exclusive - 1;
const s01Copy = s01.screen_copy;

interface GlyphBatch {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  colors: Float32Array;
  glyphs: Float32Array;
  sizes: Float32Array;
  commit(): void;
}

function createAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const cell = 64;
  canvas.width = cell * ATLAS_COLUMNS;
  canvas.height = cell * ATLAS_ROWS;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to build the character atlas.');
  context.font = `48px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.shadowColor = 'rgba(215, 240, 255, 0.2)';
  context.shadowBlur = 2;
  for (let index = 0; index < GLYPHS.length; index++) {
    context.fillText(GLYPHS[index], (index % ATLAS_COLUMNS + 0.5) * cell, (Math.floor(index / ATLAS_COLUMNS) + 0.51) * cell);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createGlyphBatch(count: number, atlas: THREE.Texture): GlyphBatch {
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute('position', plane.getAttribute('position'));
  geometry.setAttribute('uv', plane.getAttribute('uv'));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const glyphs = new Float32Array(count);
  const sizes = new Float32Array(count * 2);
  geometry.setAttribute('iPosition', new THREE.InstancedBufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('iColor', new THREE.InstancedBufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('iGlyph', new THREE.InstancedBufferAttribute(glyphs, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('iSize', new THREE.InstancedBufferAttribute(sizes, 2));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlas }, atlasGrid: { value: new THREE.Vector2(ATLAS_COLUMNS, ATLAS_ROWS) } },
    vertexShader: `
      attribute vec3 iPosition;
      attribute vec3 iColor;
      attribute float iGlyph;
      attribute vec2 iSize;
      varying vec2 glyphUV;
      varying vec3 glyphColor;
      uniform vec2 atlasGrid;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(iPosition, 1.0);
        viewPosition.xy += position.xy * iSize;
        gl_Position = projectionMatrix * viewPosition;
        vec2 cell = vec2(mod(iGlyph, atlasGrid.x), floor(iGlyph / atlasGrid.x));
        glyphUV = vec2((cell.x + uv.x) / atlasGrid.x, 1.0 - (cell.y + 1.0 - uv.y) / atlasGrid.y);
        glyphColor = iColor;
      }
    `,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 glyphUV;
      varying vec3 glyphColor;
      void main() {
        float coverage = texture2D(atlas, glyphUV).a;
        if (coverage < 0.08) discard;
        gl_FragColor = vec4(glyphColor, coverage);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const commit = () => {
    geometry.getAttribute('iPosition').needsUpdate = true;
    geometry.getAttribute('iColor').needsUpdate = true;
    geometry.getAttribute('iGlyph').needsUpdate = true;
  };
  return { mesh, geometry, material, positions, colors, glyphs, sizes, commit };
}

interface WindowPanel {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  rest: THREE.Vector3;
  phase: number;
}

function createWindow(copy: string, label: string, width: number, position: THREE.Vector3, phase: number): WindowPanel {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 288;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to build the terminal windows.');
  // A quiet terminal surface lets the sparse characters carry the panel's shape.
  context.fillStyle = 'rgba(7, 15, 19, 0.74)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'middle';
  context.font = `22px ${FONT_STACK}`;
  context.fillStyle = '#344f59';
  const characterWidth = context.measureText('|').width;
  const borderCharacters = Math.floor((canvas.width - 36) / characterWidth);
  const border = `+${'-'.repeat(borderCharacters - 2)}+`;
  const rightBorder = 18 + (borderCharacters - 1) * characterWidth;
  context.fillText(border, 18, 22);
  context.fillText(border, 18, 267);
  for (const y of [65, 109, 153, 197, 239]) {
    context.fillText('|', 18, y);
    context.fillText('|', rightBorder, y);
  }
  context.font = `23px ${FONT_STACK}`;
  context.fillStyle = '#49646d';
  context.fillText(label, 54, 65);
  context.font = `39px ${FONT_STACK}`;
  context.fillStyle = '#a5c6cf';
  context.fillText(copy, 54, 143);
  context.font = `22px ${FONT_STACK}`;
  context.fillStyle = '#36535d';
  context.fillText('> awaiting response', 54, 215);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.75, toneMapped: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * canvas.height / canvas.width), material);
  mesh.position.copy(position);
  return { mesh, texture, rest: position.clone(), phase };
}

export async function createPilotScene(canvas: HTMLCanvasElement): Promise<PilotScene> {
  // No atlas is built before the font-loading readiness promise has settled.
  await document.fonts.ready;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(pilotTimeline.preview.width, pilotTimeline.preview.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x04070a, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, pilotTimeline.preview.width / pilotTimeline.preview.height, 0.1, 50);
  const samples = createBodySamples();
  const idHash = characterIdHash(samples);
  const atlas = createAtlas();
  const body = createGlyphBatch(samples.length, atlas);
  body.material.depthWrite = true;
  body.mesh.renderOrder = 2;
  for (let index = 0; index < samples.length; index++) body.sizes.set([0.078, 0.093], index * 2);
  scene.add(body.mesh);

  const DUST_COUNT = 180;
  const FLOOR_COUNT = 136;
  const environment = createGlyphBatch(DUST_COUNT + FLOOR_COUNT, atlas);
  environment.mesh.renderOrder = 0;
  scene.add(environment.mesh);
  for (let index = 0; index < DUST_COUNT; index++) environment.sizes.set([0.055, 0.073], index * 2);
  for (let index = DUST_COUNT; index < DUST_COUNT + FLOOR_COUNT; index++) environment.sizes.set([0.046, 0.062], index * 2);

  const panels = [
    createWindow(s01Copy[0], 'care / process_014', 3.05, new THREE.Vector3(-2.72, 0.93, 1.15), 0.4),
    createWindow(s01Copy[1], 'response / queue_014', 3.7, new THREE.Vector3(1.22, 2.18, -2.8), 2.1),
    createWindow(s01Copy[2], 'subject / monitor_014', 3.35, new THREE.Vector3(2.70, -0.10, 0.45), 3.7),
  ];
  panels[0].mesh.rotation.y = 0.09;
  panels[1].mesh.rotation.y = -0.08;
  panels[1].mesh.material.opacity = 0.48;
  panels[2].mesh.rotation.y = -0.12;
  for (const panel of panels) {
    panel.mesh.renderOrder = 1;
    scene.add(panel.mesh);
  }

  // Sparse floor ticks establish a standing plane without a solid platform.
  const context = renderer.getContext();
  const debugRenderer = context.getExtension('WEBGL_debug_renderer_info');
  const rendererDescription = debugRenderer
    ? String(context.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL))
    : String(context.getParameter(context.RENDERER));
  let disposed = false;

  const renderFrame = (frame: number, seed: number): SceneEvidence => {
    if (disposed) throw new Error('Cannot render a disposed scene.');
    assertOutputFrame(frame);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be a uint32 integer.');
    const state = sampleCharacterFrame(samples, frame, seed);
    const t = Math.min(frame, S01_LAST_FRAME) * pilotTimeline.video.fps_den / pilotTimeline.video.fps_num;
    body.positions.set(state.positions);
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      const brightness = state.brightness[index];
      const chest = sample.part === 'torso' && sample.front && Math.hypot(sample.position[0] * 1.5, sample.position[1] - 0.35) < 0.23;
      body.colors.set(chest ? [brightness * 0.57, brightness * 0.87, brightness * 0.92] : [brightness * 0.87, brightness * 0.92, brightness], index * 3);
      // Texture choice varies with seed, while the anatomical IDs and sample grid stay fixed.
      body.glyphs[index] = Math.floor(noise(seed, index + 4000) * GLYPHS.length);
    }
    body.commit();

    for (let index = 0; index < DUST_COUNT; index++) {
      const phase = noise(seed, index + 9000) * Math.PI * 2;
      const x = (noise(seed, index + 10000) - 0.5) * 15 + Math.sin(t * 0.13 + phase) * 0.035;
      const y = (noise(seed, index + 11000) - 0.5) * 7.7 + Math.cos(t * 0.11 + phase) * 0.018;
      const z = -3.8 - noise(seed, index + 12000) * 7;
      environment.positions.set([x, y, z], index * 3);
      const light = 0.027 + noise(seed, index + 13000) * 0.038;
      environment.colors.set([light * 0.68, light * 0.91, light], index * 3);
      environment.glyphs[index] = Math.floor(noise(seed, index + 14000) * 12);
    }
    for (let index = 0; index < FLOOR_COUNT; index++) {
      const column = index % 17;
      const row = Math.floor(index / 17);
      const target = DUST_COUNT + index;
      const x = (column - 8) * 0.48;
      const z = (row - 2) * -0.62;
      environment.positions.set([x, -2.28, z], target * 3);
      const light = 0.038 + Math.max(0, 1 - Math.abs(x) / 4) * 0.018;
      environment.colors.set([light * 0.67, light * 0.86, light], target * 3);
      environment.glyphs[target] = GLYPHS.indexOf(row % 3 === 0 && column % 4 === 0 ? '+' : '.');
    }
    environment.commit();
    for (const panel of panels) {
      panel.mesh.position.copy(panel.rest);
      panel.mesh.position.y += Math.sin(t * 0.3 + panel.phase) * 0.018;
    }
    camera.position.set(0.06, 0.22, 10.9 - t * 0.10);
    camera.lookAt(0, -0.14, 0);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const cameraPosition = camera.position.toArray();
    return {
      characterCount: samples.length,
      characterIdHash: idHash,
      finite: state.finite && cameraPosition.every(Number.isFinite),
      renderer: rendererDescription,
      cameraPosition,
      bounds: state.bounds,
    };
  };

  return {
    renderFrame,
    resize(width, height) {
      if (disposed) throw new Error('Cannot resize a disposed scene.');
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('Canvas dimensions must be positive integers.');
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of [body, environment]) {
        batch.geometry.dispose();
        batch.material.dispose();
      }
      for (const panel of panels) {
        panel.mesh.geometry.dispose();
        panel.mesh.material.dispose();
        panel.texture.dispose();
      }
      atlas.dispose();
      renderer.dispose();
    },
  };
}
