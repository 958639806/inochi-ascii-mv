import * as THREE from 'three';
import { characterIdHash, createBodySamples, noise, sampleCharacterFrame } from './character';
import type { CharacterFrame } from './character';
import { getDirectionState } from './direction';
import { assertOutputFrame, pilotTimeline } from './timeline';

export interface SceneEvidence {
  characterCount: number;
  characterIdHash: string;
  finite: boolean;
  renderer: string;
  cameraPosition: number[];
  bounds: { min: number[]; max: number[] };
  bodyMode: CharacterFrame['bodyMode'];
  dispersion: number;
  reassembly: number;
  rootPosition: number[];
  drawCalls: number;
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
    geometry.getAttribute('iSize').needsUpdate = true;
  };
  return { mesh, geometry, material, positions, colors, glyphs, sizes, commit };
}

interface WindowPanel {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  rest: THREE.Vector3;
  phase: number;
  kind: 'surface' | 'pressure' | 'backroom' | 'status';
}

function createWindow(copy: string, label: string, width: number, position: THREE.Vector3, phase: number, kind: WindowPanel['kind'] = 'surface'): WindowPanel {
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
  const lines = copy.split('\n');
  lines.forEach((line, index) => context.fillText(line, 54, lines.length === 1 ? 143 : 112 + index * 53));
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
  return { mesh, texture, rest: position.clone(), phase, kind };
}

export async function createPilotScene(canvas: HTMLCanvasElement): Promise<PilotScene> {
  await document.fonts.ready;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(pilotTimeline.preview.width, pilotTimeline.preview.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x04070a, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, pilotTimeline.preview.width / pilotTimeline.preview.height, 0.1, 60);
  const samples = createBodySamples();
  const idHash = characterIdHash(samples);
  const atlas = createAtlas();
  const body = createGlyphBatch(samples.length, atlas);
  body.material.depthWrite = true;
  body.mesh.renderOrder = 2;
  for (let i = 0; i < samples.length; i++) body.sizes.set([0.079, 0.096], i * 2);
  scene.add(body.mesh);
  const DUST_COUNT = 220;
  const FLOOR_COUNT = 17 * 16;
  const environment = createGlyphBatch(DUST_COUNT + FLOOR_COUNT, atlas);
  environment.mesh.renderOrder = 0;
  scene.add(environment.mesh);
  for (let i = 0; i < DUST_COUNT; i++) environment.sizes.set([0.064, 0.080], i * 2);
  for (let i = DUST_COUNT; i < DUST_COUNT + FLOOR_COUNT; i++) environment.sizes.set([0.046, 0.062], i * 2);
  const STORM_COUNT = 960;
  const storm = createGlyphBatch(STORM_COUNT, atlas);
  storm.mesh.renderOrder = 3;
  scene.add(storm.mesh);
  const panels: WindowPanel[] = [
    createWindow(s01Copy[0], 'care / process_014', 3.05, new THREE.Vector3(-2.72, 0.93, 1.15), 0.4),
    createWindow(s01Copy[1], 'response / queue_014', 3.7, new THREE.Vector3(1.22, 2.18, -2.8), 2.1),
    createWindow(s01Copy[2], 'subject / monitor_014', 3.35, new THREE.Vector3(2.70, -0.10, 0.45), 3.7),
    createWindow('EMPATHY SCORE: 98\nACTION TAKEN: NONE', 'reply / process_014', 3.2, new THREE.Vector3(-3.3, 1.45, -0.3), 1.0, 'pressure'),
    createWindow('RESPONSE QUEUED', 'request / queue_014', 2.8, new THREE.Vector3(3.4, 1.3, -0.8), 2.7, 'pressure'),
    createWindow('SUBJECT MUST COMPLY', 'policy / process_014', 3.0, new THREE.Vector3(-3.7, -0.65, -1.4), 0.3, 'pressure'),
    createWindow('CARE TEMPLATE ACTIVE', 'care / loop_014', 2.9, new THREE.Vector3(3.7, -1.1, -2.1), 2.2, 'pressure'),
    createWindow('response automated\npain not processed', 'operator_014 / subject_014', 4.0, new THREE.Vector3(-2.7, 0.85, -4.2), 0.8, 'backroom'),
    createWindow('queue full\ncase ignored', 'audit / process_014', 3.5, new THREE.Vector3(2.6, -0.45, -5.6), 2.4, 'backroom'),
    createWindow('STATUS: ACTIVE', 'subject_014 / unresolved', 2.7, new THREE.Vector3(-1.75, 1.25, -4.0), 0.0, 'status'),
  ];
  for (const panel of panels) {
    panel.mesh.renderOrder = panel.rest.z > 0 ? 3 : 1;
    scene.add(panel.mesh);
  }
  const gl = renderer.getContext();
  const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererDescription = debugRenderer ? String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const shotStart = (id: string) => pilotTimeline.shots.find((s) => s.id === id)!.first_frame;
  const s04Start = shotStart('S04');
  const s05Start = shotStart('S05');
  const s06Start = shotStart('S06');
  const s07Start = shotStart('S07');
  const s08Start = shotStart('S08');
  const smooth = (value: number) => { const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); };
  const ramp = (frame: number, a: number, b: number) => smooth((frame - a) / (b - a));
  let disposed = false;

  const renderFrame = (frame: number, seed: number): SceneEvidence => {
    if (disposed) throw new Error('Cannot render a disposed scene.');
    assertOutputFrame(frame);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be a uint32 integer.');
    const state = sampleCharacterFrame(samples, frame, seed);
    const direction = getDirectionState(frame, seed);
    const t = frame * pilotTimeline.video.fps_den / pilotTimeline.video.fps_num;
    const lateFailure = ramp(frame, s07Start, s08Start);
    const surfaceFailure = ramp(frame, s07Start - (s07Start - s06Start) * 0.12, s07Start + (s08Start - s07Start) * 0.24);
    const returnPass = ramp(frame, s06Start, s07Start);
    body.positions.set(state.positions);
    for (let i = 0; i < samples.length; i++) {
      const point = samples[i];
      const light = state.brightness[i];
      const chest = point.part === 'torso' && point.front && Math.hypot(point.position[0] * 1.5, point.position[1] - 0.35) < 0.23;
      body.colors.set(chest ? [light * 0.57, light * 0.87, light * 0.92] : [light * 0.87, light * 0.92, light], i * 3);
      body.glyphs[i] = Math.floor(noise(seed, i + 4000) * GLYPHS.length);
      const spreadSize = 1 + state.dispersion * 0.17;
      body.sizes.set([0.079 * spreadSize, 0.096 * spreadSize], i * 2);
    }
    body.commit();

    for (let i = 0; i < DUST_COUNT; i++) {
      const phase = noise(seed, i + 9000) * Math.PI * 2;
      const drift = 0.12 + direction.stormStrength * 0.55;
      const x = (noise(seed, i + 10000) - 0.5) * 17 + Math.sin(t * 0.35 + phase) * drift;
      const y = (noise(seed, i + 11000) - 0.5) * 8 + Math.cos(t * 0.27 + phase) * drift * 0.65;
      const z = -3.8 - noise(seed, i + 12000) * 9;
      environment.positions.set([x, y, z], i * 3);
      const light = (0.035 + noise(seed, i + 13000) * 0.045) * (1 + direction.explosion * 0.3);
      environment.colors.set([light * 0.68, light * 0.91, light], i * 3);
      environment.glyphs[i] = Math.floor(noise(seed, i + 14000) * 12);
    }
    for (let i = 0; i < FLOOR_COUNT; i++) {
      const col = i % 17;
      const row = Math.floor(i / 17);
      const idx = DUST_COUNT + i;
      const x = (col - 8) * 0.48;
      const z = (row - 2) * -0.68;
      environment.positions.set([x, -2.28, z], idx * 3);
      const light = 0.040 + Math.max(0, 1 - Math.abs(x) / 4) * 0.025;
      environment.colors.set([light * 0.67, light * 0.86, light], idx * 3);
      environment.glyphs[idx] = GLYPHS.indexOf(row % 3 === 0 && col % 4 === 0 ? '+' : '.');
    }
    environment.commit();

    const wallBreak = direction.explosion * (1 - returnPass);
    const rearLogs = direction.backroom;
    const stormPower = direction.stormStrength * (1 - rearLogs * 0.88) * (1 - lateFailure * 0.8);
    storm.mesh.visible = stormPower > 0.002 || rearLogs > 0.03;
    const stormCopy = 'EMPATHY_RESPONSE_READY_ACTION_TAKEN_NONE_SUBJECT_MUST_COMPLY_';
    for (let i = 0; i < STORM_COUNT; i++) {
      const col = i % 40;
      const row = Math.floor(i / 40);
      const phase = noise(seed, i + 24000) * 6.283185;
      const side = col < 20 ? -1 : 1;
      const baseX = (col - 19.5) * 0.16;
      const baseY = (row - 11.5) * 0.18;
      const flow = Math.sin(t * 2.8 + row * 0.8) * 0.22;
      let x = baseX + flow + side * wallBreak * (2.8 + noise(seed, i + 25000) * 1.8);
      let y = baseY + Math.sin(col * 0.22 + t * 1.7) * 0.13 + wallBreak * Math.sin(phase) * 1.7;
      let z = 0.85 + Math.sin(row * 0.35 + t * 1.1) * 0.18 + wallBreak * 3.5;
      const obstacleX = baseX + side * returnPass * (1.7 + state.reassembly * 0.85);
      x += (obstacleX - x) * returnPass;
      z += (-1.8 - row * 0.04 - z) * returnPass;
      const logX = (noise(seed, i + 27000) - 0.5) * 13;
      const logY = (noise(seed, i + 28000) - 0.5) * 6 + Math.sin(t * 0.23 + phase) * 0.5;
      const logZ = -6 - noise(seed, i + 29000) * 6;
      x += (logX - x) * rearLogs;
      y += (logY - y) * rearLogs;
      z += (logZ - z) * rearLogs;
      storm.positions.set([x, y, z], i * 3);
      const centralGap = smooth((Math.abs(baseX) - 0.38) / 0.35);
      const gap = frame >= s04Start && frame < s06Start ? 1 : 0.24 + centralGap * 0.76;
      const light = (0.075 + noise(seed, i + 30000) * 0.065) * stormPower * gap + rearLogs * 0.038;
      const redShard = wallBreak > 0.1 && i % 13 === 0;
      storm.colors.set(redShard ? [light * 1.1, light * 0.32, light * 0.26] : [light * 0.47, light * 0.85, light], i * 3);
      storm.glyphs[i] = GLYPHS.indexOf(stormCopy[(i + row * 3) % stormCopy.length]);
      storm.sizes.set([0.083 + wallBreak * 0.028, 0.103 + wallBreak * 0.035], i * 2);
    }
    storm.commit();

    for (const [index, panel] of panels.entries()) {
      const side = Math.sign(panel.rest.x) || 1;
      const pressure = direction.panelPressure;
      panel.mesh.position.copy(panel.rest);
      panel.mesh.rotation.set(0, side * -0.08, 0);
      panel.mesh.scale.setScalar(1);
      let opacity = 0;
      if (panel.kind === 'surface' || panel.kind === 'pressure') {
        panel.mesh.position.x = panel.rest.x * (1 - pressure * 0.47) + side * wallBreak * (2.4 + index * 0.12);
        panel.mesh.position.y = panel.rest.y * (1 - pressure * 0.18) + Math.sin(t * 0.55 + panel.phase) * 0.07;
        panel.mesh.position.z = panel.rest.z + pressure * 0.8 + wallBreak * 3.0 - returnPass * 2.5;
        panel.mesh.rotation.y += side * pressure * 0.20 + side * wallBreak * 0.42;
        panel.mesh.rotation.z = side * wallBreak * 0.15 + Math.sin(t * 0.9 + panel.phase) * lateFailure * 0.015;
        panel.mesh.scale.setScalar(1 - pressure * 0.1 - lateFailure * 0.22);
        const emergence = panel.kind === 'pressure' ? ramp(frame, shotStart('S02'), shotStart('S03')) : 1;
        const primary = panel.kind === 'pressure' && index === 3;
        const surfaceDimming = panel.kind === 'surface' ? 1 - pressure * 0.74 : 1;
        opacity = (primary ? 0.82 : panel.kind === 'pressure' ? 0.34 : index === 1 ? 0.42 : 0.61) * emergence * surfaceDimming * (1 - rearLogs) * (1 - surfaceFailure) * (1 - wallBreak * 0.7);
        if (primary) panel.mesh.renderOrder = 4;
      } else if (panel.kind === 'backroom') {
        panel.mesh.position.y += Math.sin(t * 0.45 + panel.phase) * 0.19;
        opacity = rearLogs * 0.84 + lateFailure * 0.07;
      } else {
        panel.mesh.position.x += Math.sin(t * 0.65) * 0.05;
        opacity = ramp(frame, s07Start, s07Start + (s08Start - s07Start) * 0.33) * (1 - ramp(frame, s08Start, pilotTimeline.video.total_frames) * 0.38) * 0.82;
      }
      panel.mesh.material.opacity = opacity;
      panel.mesh.visible = opacity > 0.005;
    }
    camera.position.fromArray(direction.cameraPosition);
    camera.up.set(Math.sin(direction.cameraRoll), Math.cos(direction.cameraRoll), 0);
    camera.lookAt(...direction.cameraTarget);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const cameraPosition = camera.position.toArray();
    return {
      characterCount: samples.length,
      characterIdHash: idHash,
      finite: state.finite && cameraPosition.every(Number.isFinite) && direction.cameraTarget.every(Number.isFinite),
      renderer: rendererDescription,
      cameraPosition,
      bounds: state.bounds,
      bodyMode: state.bodyMode,
      dispersion: state.dispersion,
      reassembly: state.reassembly,
      rootPosition: state.rootPosition,
      drawCalls: renderer.info.render.calls,
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
      for (const batch of [body, environment, storm]) { batch.geometry.dispose(); batch.material.dispose(); }
      for (const panel of panels) { panel.mesh.geometry.dispose(); panel.mesh.material.dispose(); panel.texture.dispose(); }
      atlas.dispose();
      renderer.dispose();
    },
  };
}
