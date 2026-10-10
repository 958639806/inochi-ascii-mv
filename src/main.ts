import './style.css';
import audioUrl from '../assets/audio/pilot_058-073.flac?url';
import { createPilotScene } from './scene';
import type { PilotScene, SceneEvidence } from './scene';
import { getFrameInfo, pilotTimeline } from './timeline';

export interface RenderEvidence extends SceneEvidence {
  frame: number;
  localSeconds: number;
  sourceSeconds: number;
  shotId: string;
  implemented: boolean;
}

declare global {
  interface Window {
    pilotReady: Promise<void>;
    renderFrame: (frame: number, seed?: number) => Promise<RenderEvidence>;
  }
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="workbench">
    <header class="masthead">
      <div class="identity"><span class="mark">命</span><div><h1>INOCHI <span>/ PILOT 01</span></h1><p>字符动画 · 15 秒制作试片</p></div></div>
      <div class="session"><span class="status-dot"></span><span id="ready-state">场景加载中</span><small>960 × 540 · 60 FPS</small></div>
    </header>
    <section class="viewer" aria-label="动画预览">
      <div class="viewer-heading"><span id="shot-heading">S01 / 压抑建立</span><span id="time-heading">00.000s · 原曲 58.000s</span></div>
      <canvas id="pilot-canvas" width="960" height="540" aria-label="字符动画画面"></canvas>
      <div class="viewer-footer"><span id="implementation">S01 工程预览 · 视觉待导演审阅</span><span id="seed-heading"></span></div>
    </section>
    <section class="transport" aria-label="预览控制">
      <div class="transport-row">
        <button id="loop-s01" class="primary" disabled>循环看 S01</button>
        <button id="play" disabled>试听预览</button>
        <label class="frame-label">FRAME <input id="frame-input" type="number" min="0" max="899" step="1" value="0" aria-label="跳转到帧" /></label>
        <div class="keyframes"><span>首轮审阅</span><button data-frame="0">000</button><button data-frame="36">036</button><button data-frame="71">071</button></div>
        <span id="frame-count">000 / 899</span>
      </div>
      <input id="scrub" type="range" min="0" max="899" step="1" value="0" aria-label="帧时间轴" />
    </section>
    <section class="shots" aria-label="镜头导航">${pilotTimeline.shots.map((shot) => `<button class="shot" data-frame="${shot.first_frame}" data-shot="${shot.id}"><span>${shot.id}<small>${shot.id === 'S01' ? '可预览' : '待实现'}</small></span><strong>${shot.name}</strong><em>${shot.first_frame}–${shot.last_frame_exclusive - 1} 帧</em></button>`).join('')}</section>
    <footer class="notes"><p>点“循环看 S01”可无声反复查看肩胸、头部与手臂动作。试听 1.2 秒后进入待实现镜头，画面保持 S01 尾帧。</p><p>歌词与鼓点尚未精校 · 三张静帧用于构图与可读性审阅</p></footer>
    <p id="error" role="alert" hidden></p>
    <audio id="pilot-audio" preload="none" src="${audioUrl}"></audio>
  </main>`;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const canvas = element<HTMLCanvasElement>('pilot-canvas');
const audio = element<HTMLAudioElement>('pilot-audio');
const slider = element<HTMLInputElement>('scrub');
const input = element<HTMLInputElement>('frame-input');
const play = element<HTMLButtonElement>('play');
const loop = element<HTMLButtonElement>('loop-s01');
const defaultSeed = pilotTimeline.timing.random_seed;
const fps = pilotTimeline.video.fps_num / pilotTimeline.video.fps_den;
const lastOutputFrame = pilotTimeline.video.total_frames - 1;
const firstShot = pilotTimeline.shots.find((shot) => shot.id === 'S01');
if (!firstShot) throw new Error('The pilot timeline must define S01.');
const loopFirstFrame = firstShot.first_frame;
const loopFrameCount = firstShot.last_frame_exclusive - loopFirstFrame;
let currentFrame = 0;
let currentSeed = defaultSeed;
let scene: PilotScene;
let previewTick = 0;
let looping = false;
let loopOrigin = 0;

function showError(error: unknown): void {
  const box = element('error');
  box.hidden = false;
  box.textContent = error instanceof Error ? error.message : String(error);
}

function stopPreview(): void {
  audio.pause();
  cancelAnimationFrame(previewTick);
  looping = false;
  loop.textContent = '循环看 S01';
  play.textContent = '试听预览';
}

function drawFrame(frame: number, seed: number): RenderEvidence {
  const info = getFrameInfo(frame);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed 必须为 0–4294967295 的整数。');
  }
  const evidence = scene.renderFrame(frame, seed);
  currentFrame = frame;
  currentSeed = seed;
  input.value = slider.value = String(frame);
  element('frame-count').textContent = `${String(frame).padStart(3, '0')} / 899`;
  element('shot-heading').textContent = `${info.shot.id} / ${info.shot.name}`;
  element('time-heading').textContent = `${info.localSeconds.toFixed(3)}s · 原曲 ${info.sourceSeconds.toFixed(3)}s`;
  element('seed-heading').textContent = `SEED ${seed}`;
  element('implementation').textContent = info.implemented ? (looping ? 'S01 无声循环 · 身体动作审阅' : 'S01 动作修订 · 视觉待导演审阅') : `${info.shot.id} 待实现 · 当前画面为 S01 尾帧`;
  document.querySelectorAll<HTMLElement>('[data-shot]').forEach((button) => {
    button.classList.toggle('active', button.dataset.shot === info.shot.id);
    button.setAttribute('aria-pressed', String(button.dataset.shot === info.shot.id));
  });
  return { ...evidence, frame, localSeconds: info.localSeconds, sourceSeconds: info.sourceSeconds, shotId: info.shot.id, implemented: info.implemented };
}

window.pilotReady = (async () => {
  await document.fonts.ready;
  scene = await createPilotScene(canvas);
  scene.resize(pilotTimeline.preview.width, pilotTimeline.preview.height);
  drawFrame(0, defaultSeed);
  element('ready-state').textContent = '场景就绪';
  play.disabled = false;
  loop.disabled = false;
})();

window.renderFrame = async (frame, seed = defaultSeed) => {
  await window.pilotReady;
  stopPreview();
  return drawFrame(frame, seed);
};

void window.pilotReady.catch((error: unknown) => {
  element('ready-state').textContent = '加载失败';
  showError(error);
});

async function seek(frame: number): Promise<void> {
  try {
    await window.renderFrame(frame, currentSeed);
    audio.currentTime = frame / fps;
    element('error').hidden = true;
  } catch (error) {
    showError(error);
  }
}

slider.addEventListener('input', () => void seek(Number(slider.value)));
input.addEventListener('change', () => void seek(Number(input.value)));
document.querySelectorAll<HTMLButtonElement>('[data-frame]').forEach((button) => {
  button.addEventListener('click', () => void seek(Number(button.dataset.frame)));
});

function previewFromAudio(): void {
  if (audio.paused) return;
  const frame = Math.min(lastOutputFrame, Math.floor(audio.currentTime * fps));
  drawFrame(frame, currentSeed);
  previewTick = requestAnimationFrame(previewFromAudio);
}

// This clock only selects preview frames; renderFrame itself never reads it.
function loopFromTime(time: number): void {
  if (!looping) return;
  const elapsedFrames = Math.max(0, Math.floor((time - loopOrigin) * fps / 1000));
  drawFrame(loopFirstFrame + elapsedFrames % loopFrameCount, currentSeed);
  previewTick = requestAnimationFrame(loopFromTime);
}

loop.addEventListener('click', async () => {
  if (looping) {
    stopPreview();
    return;
  }
  try {
    await window.pilotReady;
    stopPreview();
    looping = true;
    loop.textContent = '停止循环';
    loopOrigin = performance.now();
    loopFromTime(loopOrigin);
  } catch (error) {
    stopPreview();
    showError(error);
  }
});

play.addEventListener('click', async () => {
  if (!audio.paused) {
    stopPreview();
    return;
  }
  try {
    await window.pilotReady;
    stopPreview();
    if (currentFrame === lastOutputFrame) drawFrame(0, currentSeed);
    audio.currentTime = currentFrame / fps;
    await audio.play();
    play.textContent = '暂停试听';
    previewFromAudio();
  } catch (error) {
    stopPreview();
    showError(error);
  }
});

audio.addEventListener('ended', () => {
  stopPreview();
  drawFrame(lastOutputFrame, currentSeed);
});
window.addEventListener('pagehide', () => {
  stopPreview();
  scene?.dispose();
});
