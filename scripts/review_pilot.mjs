#!/usr/bin/env node
/** Capture the configured full-pilot review frames and check browser engineering. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'reviews', 'pilot-v2');
const url = process.env.PILOT_URL || 'http://127.0.0.1:4173';
const channel = process.env.PILOT_BROWSER_CHANNEL || 'msedge';
const boundaryFrames = [0, 71, 72, 149, 150, 239, 240, 329, 330, 419, 420, 569, 570, 707, 708, 899];
const repeatedFrameSet = [285, 495, 639, 899, 0];
const report = {
  schemaVersion: 1, status: 'FAIL', startedAt: new Date().toISOString(), completedAt: null, url, seed: null,
  environment: { node: process.version, platform: process.platform, channel, headless: true,
    viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, browserVersion: null, playwright: null },
  checks: [], frames: [], shots: [], boundaryFrames, repeatOrder: [], repeatedFrames: [],
  loopSamples: [], pageErrors: [], consoleErrors: [], consoleWarnings: [], requestFailures: [], fatalErrors: [],
  limitations: [
    'This is an engineering review of a rough 15-second pilot; director aesthetic acceptance remains pending.',
    'Beat phase and lyric alignment remain uncalibrated; screenshots do not prove music synchronization.',
    'PNG changes demonstrate changed pixels only, not perceptible motion, narrative clarity, or dramatic tension.',
    'Pixel reproducibility is tested only in the recorded browser, dependency, font, and GPU environment.',
    'Central bright-pixel bounding boxes are an engineering presence proxy, may include panels, and do not identify or artistically validate a person.',
    'Browser font APIs do not fully expose the resolved system font fallback.',
    'Twenty-four review PNGs are not a 900-frame video export; muted UI playback is not human listening review.',
  ],
};
function check(name, passed, details = {}) {
  report.checks.push({ name, passed: Boolean(passed), details });
  return Boolean(passed);
}
function errorText(error) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function numbers(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}
async function timeout(operation, label, milliseconds = 30_000) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
function dimensions(png) {
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG screenshot.');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
function shuffle(values, seed) {
  const result = [...values];
  let state = seed >>> 0 || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
function validate(snapshot, frame, timeline, label) {
  const shot = timeline.shots.find((item) => frame >= item.first_frame && frame < item.last_frame_exclusive);
  const fields = ['frame', 'localSeconds', 'sourceSeconds', 'shotId', 'implemented', 'characterCount',
    'characterIdHash', 'finite', 'renderer', 'cameraPosition', 'bounds', 'bodyMode', 'dispersion',
    'reassembly', 'rootPosition', 'drawCalls'];
  const allFields = snapshot && fields.every((field) => Object.hasOwn(snapshot, field));
  const boundsMin = snapshot?.bounds?.min;
  const boundsMax = snapshot?.bounds?.max;
  const validBounds = Array.isArray(boundsMin) && Array.isArray(boundsMax) && boundsMin.length === 3
    && boundsMax.length === 3 && boundsMin.every((value, index) => Number.isFinite(value)
      && Number.isFinite(boundsMax[index]) && boundsMax[index] >= value);
  check(label, allFields && snapshot.frame === frame && snapshot.shotId === shot?.id
    && snapshot.implemented === true && snapshot.finite === true && numbers(snapshot).every(Number.isFinite)
    && Math.abs(snapshot.localSeconds - frame / 60) < 1e-9
    && Math.abs(snapshot.sourceSeconds - (58 + frame / 60)) < 1e-9
    && Number.isInteger(snapshot.characterCount) && snapshot.characterCount > 0
    && typeof snapshot.characterIdHash === 'string' && snapshot.characterIdHash.length > 0
    && typeof snapshot.renderer === 'string' && snapshot.renderer.length > 0
    && numbers(snapshot.cameraPosition).length === 3 && numbers(snapshot.rootPosition).length === 3
    && typeof snapshot.bodyMode === 'string' && snapshot.bodyMode.length > 0
    && Number.isFinite(snapshot.dispersion) && snapshot.dispersion >= 0 && snapshot.dispersion <= 1
    && Number.isFinite(snapshot.reassembly) && snapshot.reassembly >= 0 && snapshot.reassembly <= 1
    && Number.isInteger(snapshot.drawCalls) && snapshot.drawCalls > 0 && validBounds,
  { expectedShot: shot?.id, snapshot });
}

async function render(page, frame, seed) {
  return timeout(page.evaluate(async ({ frame, seed }) => {
    const snapshot = await window.renderFrame(frame, seed);
    const canvas = document.querySelector('canvas#pilot-canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl || gl.isContextLost()) throw new Error('Pilot WebGL context is missing or lost.');
    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
    gl.finish();
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const readPixelsError = gl.getError();
    const centralRegion = { xMin: Math.floor(canvas.width * 0.25), xMaxExclusive: Math.ceil(canvas.width * 0.75),
      yMin: Math.floor(canvas.height * 0.10), yMaxExclusive: Math.ceil(canvas.height * 0.95), coordinateSystem: 'canvas top-left' };
    let brightPixels = 0;
    let centralBrightPixels = 0;
    let xMin = canvas.width; let xMax = -1; let yMin = canvas.height; let yMax = -1;
    for (let index = 0; index < bytes.length; index += 4) {
      if (Math.max(bytes[index], bytes[index + 1], bytes[index + 2]) < 64 || bytes[index + 3] === 0) continue;
      brightPixels += 1;
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = canvas.height - 1 - Math.floor(pixel / canvas.width);
      if (x >= centralRegion.xMin && x < centralRegion.xMaxExclusive && y >= centralRegion.yMin && y < centralRegion.yMaxExclusive) {
        centralBrightPixels += 1;
        xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
      }
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { snapshot, pixels: {
      width: canvas.width, height: canvas.height, readPixelsError, brightChannelThreshold: 64,
      brightPixels, centralBrightPixels, centralRegion,
      centralBrightBoundingBox: centralBrightPixels > 0 ? { xMin, xMax, yMin, yMax, width: xMax - xMin + 1, height: yMax - yMin + 1 } : null,
      rawPixelSha256: [...digest].map((value) => value.toString(16).padStart(2, '0')).join(''),
      method: 'WebGL readPixels immediately after awaited renderFrame; central bbox is not semantic person detection',
    } };
  }, { frame, seed }), `renderFrame ${frame}`);
}
async function uiState(page) {
  return page.evaluate(() => {
    const audio = document.querySelector('#pilot-audio');
    return { observedAtMs: performance.now(), frame: Number(document.querySelector('#frame-input').value),
      loopButton: document.querySelector('#loop-pilot').textContent.trim(),
      audioPaused: audio.paused, audioTime: audio.currentTime,
      audioError: audio.error ? { code: audio.error.code, message: audio.error.message } : null };
  });
}

let browser;
let captureComplete = false;
let repeatsComplete = false;
let loopComplete = false;
try {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('PILOT_URL must be a local HTTP(S) URL without credentials.');
  }
  const timeline = JSON.parse(await readFile(path.join(root, 'config', 'pilot.timeline.json'), 'utf8'));
  const seed = timeline.timing.random_seed;
  report.seed = seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Pilot seed is not uint32.');
  const shotFrames = timeline.shots.flatMap((shot) => [shot.first_frame,
    Math.floor((shot.first_frame + shot.last_frame_exclusive) / 2), shot.last_frame_exclusive - 1]);
  const reviewFrames = timeline.review_frames;
  if (!check('configuration contains the 24 shot start/middle/end review frames', reviewFrames.length === 24
    && JSON.stringify(reviewFrames) === JSON.stringify(shotFrames), { reviewFrames, shotFrames })) {
    throw new Error('Review-frame configuration does not contain all eight shot triplets.');
  }
  report.reviewFrames = reviewFrames;
  const source = await readFile(path.join(root, 'src', 'scene.ts'), 'utf8');
  report.environment.sceneSourceSha256 = sha256(source);
  report.environment.atlasFontStackFromSource = source.match(/^const FONT_STACK = '([^']+)';/m)?.[1] || null;
  const { chromium } = await import('playwright');
  const require = createRequire(import.meta.url);
  report.environment.playwright = JSON.parse(await readFile(require.resolve('playwright/package.json'), 'utf8')).version;
  browser = await chromium.launch({ channel, headless: true, args: ['--mute-audio'] });
  report.environment.browserVersion = browser.version();
  const page = await browser.newPage({ viewport: report.environment.viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => report.pageErrors.push(errorText(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
    if (message.type() === 'warning') report.consoleWarnings.push(message.text());
  });
  page.on('requestfailed', (request) => report.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || 'unknown' }));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!check('local preview page loads', response?.ok() === true, { httpStatus: response?.status() })) throw new Error('Local preview did not load.');
  await page.waitForFunction(() => typeof window.renderFrame === 'function' && typeof window.pilotReady?.then === 'function');
  await timeout(page.evaluate(async () => { await window.pilotReady; await document.fonts.ready; }), 'pilotReady and fonts');
  report.environment.browser = await page.evaluate(() => {
    const canvas = document.querySelector('canvas#pilot-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, platform: navigator.platform, devicePixelRatio: window.devicePixelRatio,
      fonts: { status: document.fonts.status, canvasComputedFamily: getComputedStyle(canvas).fontFamily,
        faces: [...document.fonts].map((font) => ({ family: font.family, status: font.status })) },
      gpu: { version: gl.getParameter(gl.VERSION), vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
        unmaskedVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        contextAttributes: gl.getContextAttributes() },
      canvas: { width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height },
      audio: { preload: document.querySelector('#pilot-audio').preload, paused: document.querySelector('#pilot-audio').paused },
    };
  });
  const size = report.environment.browser.canvas;
  check('canvas backing and displayed dimensions are 960x540', size.width === 960 && size.height === 540
    && size.cssWidth === 960 && size.cssHeight === 540, size);
  check('audio is not automatically played or preloaded', report.environment.browser.audio.preload === 'none'
    && report.environment.browser.audio.paused, report.environment.browser.audio);
  await mkdir(directory, { recursive: true });
  const baseline = new Map();
  for (const frame of reviewFrames) {
    const rendered = await render(page, frame, seed);
    validate(rendered.snapshot, frame, timeline, `frame ${frame}: implemented, timing, finite state, new motion evidence`);
    const png = await page.locator('canvas#pilot-canvas').screenshot({ type: 'png', animations: 'disabled', scale: 'css' });
    const filename = `frame-${String(frame).padStart(3, '0')}.png`;
    await writeFile(path.join(directory, filename), png);
    const entry = { frame, file: `reviews/pilot-v2/${filename}`, pngSha256: sha256(png), pngDimensions: dimensions(png), ...rendered };
    report.frames.push(entry); baseline.set(frame, entry);
    check(`frame ${frame}: actual canvas PNG is 960x540`, entry.pngDimensions.width === 960 && entry.pngDimensions.height === 540,
      entry.pngDimensions);
    check(`frame ${frame}: bright rendered pixels exist`, entry.pixels.readPixelsError === 0 && entry.pixels.brightPixels > 0, entry.pixels);
  }
  captureComplete = true;
  const first = baseline.get(reviewFrames[0]).snapshot;
  check('character count and IDs remain fixed in every shot', report.frames.every((entry) =>
    entry.snapshot.characterCount === first.characterCount && entry.snapshot.characterIdHash === first.characterIdHash),
  { characterCount: first.characterCount, characterIdHash: first.characterIdHash });
  check('all 16 mandatory boundary frames were rendered and are finite', boundaryFrames.every((frame) =>
    baseline.has(frame) && baseline.get(frame).snapshot.finite === true), { boundaryFrames });
  for (const shot of timeline.shots) {
    const frames = report.frames.filter((entry) => entry.snapshot.shotId === shot.id);
    const distinctPngHashes = new Set(frames.map((entry) => entry.pngSha256)).size;
    report.shots.push({ shotId: shot.id, frames: frames.map((entry) => entry.frame), distinctPngHashes,
      allImplemented: frames.every((entry) => entry.snapshot.implemented === true) });
    check(`${shot.id}: start/middle/end PNGs change`, frames.length === 3 && distinctPngHashes === 3,
      { hashes: frames.map((entry) => ({ frame: entry.frame, pngSha256: entry.pngSha256 })), artisticAcceptance: 'NOT_TESTED' });
  }
  const s04 = report.frames.filter((entry) => entry.snapshot.shotId === 'S04');
  check('S04 reaches dispersion above 0.8', s04.some((entry) => entry.snapshot.dispersion > 0.8),
    { samples: s04.map((entry) => ({ frame: entry.frame, bodyMode: entry.snapshot.bodyMode, dispersion: entry.snapshot.dispersion })) });
  const s06 = timeline.shots.find((shot) => shot.id === 'S06');
  const s06Last = baseline.get(s06.last_frame_exclusive - 1);
  check('S06 last frame reaches reassembly above 0.9', s06Last.snapshot.reassembly > 0.9, { frame: s06Last.frame, snapshot: s06Last.snapshot });
  for (const entry of report.frames.filter((item) => ['S07', 'S08'].includes(item.snapshot.shotId))) {
    const bbox = entry.pixels.centralBrightBoundingBox;
    const worldBounds = entry.snapshot.bounds;
    const hasWorldExtent = worldBounds.max.some((value, index) => value > worldBounds.min[index]);
    check(`${entry.snapshot.shotId} frame ${entry.frame}: nonempty character and central presence proxy`, entry.snapshot.characterCount > 0
      && hasWorldExtent && entry.pixels.centralBrightPixels > 100 && bbox?.width > 1 && bbox?.height > 1,
    { snapshot: entry.snapshot, centralBrightPixels: entry.pixels.centralBrightPixels, centralBrightBoundingBox: bbox,
      interpretation: 'Engineering proxy only; bright panels may contribute; director visual review is still required.' });
  }
  const invalid = await timeout(page.evaluate(async (seed) => {
    try { await window.renderFrame(900, seed); return { rejected: false }; }
    catch (error) { return { rejected: true, error: `${error.name}: ${error.message}` }; }
  }, seed), 'reject frame 900');
  check('frame 900 is rejected without an unhandled page error', invalid.rejected, invalid);

  report.repeatOrder = shuffle([...repeatedFrameSet, ...repeatedFrameSet], seed ^ 0x50494c4f);
  report.repeatOrderSeed = (seed ^ 0x50494c4f) >>> 0;
  for (const frame of report.repeatOrder) {
    const rendered = await render(page, frame, seed);
    validate(rendered.snapshot, frame, timeline, `repeat frame ${frame}: finite implemented scene`);
    const png = await page.locator('canvas#pilot-canvas').screenshot({ type: 'png', animations: 'disabled', scale: 'css' });
    const expected = baseline.get(frame);
    const repeated = { frame, pngSha256: sha256(png), rawPixelSha256: rendered.pixels.rawPixelSha256,
      pngMatches: sha256(png) === expected.pngSha256, pixelsMatch: rendered.pixels.rawPixelSha256 === expected.pixels.rawPixelSha256,
      snapshotMatches: JSON.stringify(rendered.snapshot) === JSON.stringify(expected.snapshot) };
    report.repeatedFrames.push(repeated);
    check(`shuffled repeat frame ${frame}: same-browser pixels and state match`, repeated.pngMatches && repeated.pixelsMatch
      && repeated.snapshotMatches, repeated);
  }
  repeatsComplete = true;

  await render(page, 149, seed);
  const loop = page.locator('#loop-pilot');
  await loop.waitFor({ state: 'visible' });
  check('full-pilot loop button is enabled and labeled', await loop.isEnabled() && (await loop.textContent()).trim() === '循环看全段');
  const beforeLoop = await uiState(page);
  await loop.click();
  await page.waitForFunction(() => document.querySelector('#loop-pilot').textContent.trim() === '停止循环');
  const loopStart = await uiState(page);
  report.loopSamples.push(loopStart);
  await page.waitForFunction(() => Number(document.querySelector('#frame-input').value) > 71
    && document.querySelector('#loop-pilot').textContent.trim() === '停止循环', null, { timeout: 5_000 });
  report.loopSamples.push(await uiState(page));
  await page.waitForTimeout(220);
  const loopLater = await uiState(page);
  report.loopSamples.push(loopLater);
  report.loopTiming = { elapsedMs: loopLater.observedAtMs - loopStart.observedAtMs,
    frameAdvance: loopLater.frame - loopStart.frame,
    sampledTimelineFramesPerSecond: (loopLater.frame - loopStart.frame) * 1000 / (loopLater.observedAtMs - loopStart.observedAtMs),
    note: 'Observed timeline advancement; not a measurement of GPU draw throughput.' };
  check('full-pilot loop advances beyond frame 71', loopLater.frame > 71 && loopLater.frame !== loopStart.frame
    && report.loopSamples.every((sample) => sample.frame >= 0 && sample.frame < 900), report.loopTiming);
  check('full-pilot loop stays silent with a fixed audio clock', report.loopSamples.every((sample) => sample.audioPaused
    && sample.audioError === null && Math.abs(sample.audioTime - beforeLoop.audioTime) < 0.01), { beforeLoop, samples: report.loopSamples });
  const stoppedSnapshot = await timeout(page.evaluate(async (seed) => await window.renderFrame(36, seed), seed), 'stop loop with renderFrame');
  const stopped = await uiState(page);
  await page.waitForTimeout(150);
  const stoppedLater = await uiState(page);
  check('renderFrame stops full-pilot looping and holds frame 36', stoppedSnapshot.frame === 36 && stopped.frame === 36 && stoppedLater.frame === 36
    && stopped.loopButton === '循环看全段' && stoppedLater.loopButton === '循环看全段' && stoppedLater.audioPaused
    && Math.abs(stoppedLater.audioTime - stopped.audioTime) < 0.01, { snapshot: stoppedSnapshot, before: stopped, after: stoppedLater });
  loopComplete = true;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('no unhandled JavaScript page errors', report.pageErrors.length === 0, { errors: report.pageErrors });
  check('no browser console errors', report.consoleErrors.length === 0, { errors: report.consoleErrors });
  check('no failed browser requests', report.requestFailures.length === 0, { requests: report.requestFailures });
} catch (error) {
  report.fatalErrors.push(errorText(error));
} finally {
  if (browser) {
    try { await browser.close(); } catch (error) { report.fatalErrors.push(`Browser close: ${errorText(error)}`); }
  }
  report.completedAt = new Date().toISOString();
  const passed = captureComplete && repeatsComplete && loopComplete && report.frames.length === 24 && report.repeatedFrames.length === 10
    && report.checks.every((item) => item.passed) && report.fatalErrors.length === 0 && report.pageErrors.length === 0
    && report.consoleErrors.length === 0 && report.requestFailures.length === 0;
  report.status = passed ? 'PASS' : 'FAIL';
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'browser-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`${report.status}: ${report.checks.filter((item) => item.passed).length}/${report.checks.length} full-pilot engineering checks; ${report.frames.length} actual canvas PNGs.`);
    console.log('Report: reviews/pilot-v2/browser-report.json; director review, beat and lyric calibration remain pending.');
  } catch (error) { console.error(`FAIL saving report: ${errorText(error)}`); process.exitCode = 1; }
  if (!passed) {
    for (const error of report.fatalErrors) console.error(error);
    for (const failure of report.checks.filter((item) => !item.passed)) console.error(`Failed check: ${failure.name}`);
    process.exitCode = 1;
  }
}
