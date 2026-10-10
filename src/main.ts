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
        <button id="play" class="primary" disabled>试听预览</button>
        <label class="frame-label">FRAME <input id="frame-input" type="number" min="0" max="899" step="1" value="0" aria-label="跳转到帧" /></label>
        <div class="keyframes"><span>首轮审阅</span><button data-frame="0">000</button><button data-frame="36">036</button><button data-frame="71">071</button></div>
        <span id="frame-count">000 / 899</span>
      </div>
      <input id="scrub" type="range" min="0" max="899" step="1" value="0" aria-label="帧时间轴" />
    </section>
    <section class="shots" aria-label="镜头导航">${pilotTimeline.shots.map((shot) => `<button class="shot" data-frame="${shot.first_frame}" data-shot="${shot.id}"><span>${shot.id}<small>${shot.id === 'S01' ? '可预览' : '待实现'}</small></span><strong>${shot.name}</strong><em>${shot.first_frame}–${shot.last_frame_exclusive - 1} 帧</em></button>`).join('')}</section>
    <footer class="notes"><p>当前实现 S01 人形、呼吸与空间窗口。S02–S08 已可查询时间轴，画面保持 S01 尾帧。</p><p>歌词与鼓点尚未精校 · 三张静帧用于构图与可读性审阅</p></footer>
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
const defaultSeed = pilotTimeline.timing.random_seed;
let currentFrame = 0;
let currentSeed = defaultSeed;
let scene: PilotScene;
let previewTick = 0;

function showError(error: unknown): void {
  const box = element('error');
  box.hidden = false;
  box.textContent = error instanceof Error ? error.message : String(error);
}

function stopPreview(): void {
  audio.pause();
  cancelAnimationFrame(previewTick);
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
  element('implementation').textContent = info.implemented ? 'S01 工程预览 · 视觉待导演审阅' : `${info.shot.id} 待实现 · 当前画面为 S01 尾帧`;
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
    audio.currentTime = frame / 60;
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
  const frame = Math.min(899, Math.floor(audio.currentTime * 60));
  drawFrame(frame, currentSeed);
  previewTick = requestAnimationFrame(previewFromAudio);
}

play.addEventListener('click', async () => {
  if (!audio.paused) {
    stopPreview();
    return;
  }
  try {
    await window.pilotReady;
    if (currentFrame === 899) drawFrame(0, currentSeed);
    audio.currentTime = currentFrame / 60;
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
  drawFrame(899, currentSeed);
});
window.addEventListener('pagehide', () => {
  stopPreview();
  scene?.dispose();
});
