#!/usr/bin/env node
/**
 * Capture actual T01 canvas frames and verify engineering behavior in one browser.
 * Start Vite separately, then run: node scripts/render_keyframes.mjs
 * PILOT_URL defaults to http://127.0.0.1:5173; PILOT_BROWSER_CHANNEL may be msedge.
 * No dependency/browser downloads, FFmpeg, video export, or artistic approval here.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = path.resolve(root, process.env.PILOT_OUTPUT_DIR || 'reviews/t01');
const relativeToReviews = path.relative(path.join(root, 'reviews'), outputDirectory);
if (relativeToReviews.startsWith('..') || path.isAbsolute(relativeToReviews)) {
  throw new Error('PILOT_OUTPUT_DIR must stay within the project reviews directory.');
}
const outputRelative = path.relative(root, outputDirectory).split(path.sep).join('/');
const reportPath = path.join(outputDirectory, 'browser-report.json');
const keyframes = [0, 36, 71];
const boundaryFrames = [0, 71, 72, 149, 150, 239, 240, 329, 330, 419, 420, 569, 570, 707, 708, 899];
const repeatOrder = [71, 0, 36, 0, 71, 36];
const previewSize = { width: 960, height: 540 };
const pilotUrl = process.env.PILOT_URL || 'http://127.0.0.1:5173';
const requestedChannel = process.env.PILOT_BROWSER_CHANNEL || null;
const report = {
  schemaVersion: 1,
  task: 'T01 minimum runnable skeleton',
  startedAt: new Date().toISOString(),
  completedAt: null,
  status: 'FAIL',
  url: pilotUrl,
  seed: null,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    playwright: null,
    requestedBrowserChannel: requestedChannel || 'playwright chromium',
    browserVersion: null,
    headless: true,
  },
  checks: [],
  boundaryFrames: [],
  invalidInputs: [],
  acceptedSeedEndpoints: [],
  keyframes: [],
  repeatOrder,
  repeatedFrames: [],
  seedRestoration: [],
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  failedRequests: [],
  fatalErrors: [],
  limitations: [
    'Engineering checks do not establish artistic acceptance, lyric alignment, or beat alignment.',
    'Pixel reproducibility is tested only in this browser, dependency, and GPU environment.',
    'These are three canvas keyframes, not a 900-frame sequence or a video.',
    'System font fallback selection is not fully exposed by browser font APIs; declared families and actual environment are recorded.',
  ],
};

function check(name, passed, details = {}) {
  report.checks.push({ name, passed: Boolean(passed), details });
  return Boolean(passed);
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Screenshot is not a PNG.');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function withTimeout(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function numberValues(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numberValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numberValues);
  return [];
}

function validateSnapshot(snapshot, frame, timeline, name) {
  const expectedShot = timeline.shots.find((shot) => frame >= shot.first_frame && frame < shot.last_frame_exclusive);
  const required = ['frame', 'localSeconds', 'sourceSeconds', 'shotId', 'implemented', 'characterCount',
    'characterIdHash', 'finite', 'renderer', 'cameraPosition', 'bounds'];
  const fieldsPresent = snapshot && typeof snapshot === 'object'
    && required.every((field) => Object.hasOwn(snapshot, field));
  const numbers = numberValues(snapshot);
  const cameraNumbers = numberValues(snapshot?.cameraPosition);
  const boundsNumbers = numberValues(snapshot?.bounds);
  const passed = fieldsPresent && snapshot.frame === frame
    && Math.abs(snapshot.localSeconds - frame / 60) < 1e-9
    && Math.abs(snapshot.sourceSeconds - (58 + frame / 60)) < 1e-9
    && snapshot.shotId === expectedShot?.id
    && snapshot.implemented === (expectedShot?.id === 'S01')
    && snapshot.finite === true && numbers.every(Number.isFinite)
    && Number.isInteger(snapshot.characterCount) && snapshot.characterCount > 0
    && typeof snapshot.characterIdHash === 'string' && snapshot.characterIdHash.length > 0
    && typeof snapshot.renderer === 'string' && snapshot.renderer.length > 0
    && cameraNumbers.length >= 3 && boundsNumbers.length >= 3;
  check(name, passed, { expectedShot: expectedShot?.id, snapshot });
  return passed;
}

async function render(page, frame, seed, collectPixels = false) {
  return withTimeout(page.evaluate(async ({ frame, seed, collectPixels }) => {
    const snapshot = await window.renderFrame(frame, seed);
    if (!collectPixels) return { snapshot };
    const canvas = document.querySelector('canvas#pilot-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing canvas#pilot-canvas.');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('The pilot canvas has no WebGL context.');
    if (gl.isContextLost()) throw new Error('The pilot WebGL context is lost.');
    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
    gl.finish();
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const readPixelsError = gl.getError();
    let nonBlackPixels = 0;
    let pixelsAtLeast8 = 0;
    let brightPixelsAtLeast64 = 0;
    let centralBrightPixelsAtLeast64 = 0;
    const centralRegion = {
      coordinateSystem: 'canvas top-left; observation only, not visual acceptance',
      xMin: Math.floor(canvas.width * 0.35), xMaxExclusive: Math.ceil(canvas.width * 0.65),
      yMin: Math.floor(canvas.height * 0.20), yMaxExclusive: Math.ceil(canvas.height * 0.90),
    };
    let maximumChannel = 0;
    for (let index = 0; index < bytes.length; index += 4) {
      const maximum = Math.max(bytes[index], bytes[index + 1], bytes[index + 2]);
      if (maximum > 0 && bytes[index + 3] > 0) nonBlackPixels += 1;
      if (maximum >= 8 && bytes[index + 3] > 0) pixelsAtLeast8 += 1;
      if (maximum >= 64 && bytes[index + 3] > 0) {
        brightPixelsAtLeast64 += 1;
        const pixel = index / 4;
        const x = pixel % canvas.width;
        const y = canvas.height - 1 - Math.floor(pixel / canvas.width);
        if (x >= centralRegion.xMin && x < centralRegion.xMaxExclusive
            && y >= centralRegion.yMin && y < centralRegion.yMaxExclusive) centralBrightPixelsAtLeast64 += 1;
      }
      maximumChannel = Math.max(maximumChannel, maximum);
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const rawPixelSha256 = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      snapshot,
      pixels: {
        width: canvas.width,
        height: canvas.height,
        readPixelsError,
        nonBlackPixels,
        pixelsAtLeast8,
        brightPixelsAtLeast64,
        centralSubjectRegion: { ...centralRegion, brightPixelsAtLeast64: centralBrightPixelsAtLeast64 },
        maximumChannel,
        rawPixelSha256,
        method: 'WebGL readPixels immediately after awaited renderFrame',
      },
    };
  }, { frame, seed, collectPixels }), 15_000, `renderFrame(${frame}, ${seed})`);
}

async function browserEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas#pilot-canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      devicePixelRatio: window.devicePixelRatio,
      fonts: {
        status: document.fonts.status,
        faces: [...document.fonts].map((font) => ({ family: font.family, style: font.style, status: font.status })),
        canvasComputedFamily: canvas ? getComputedStyle(canvas).fontFamily : null,
        checks: Object.fromEntries(['Cascadia Mono', 'Consolas', 'Courier New', 'monospace'].map((family) => [family, document.fonts.check(`16px "${family}"`)])),
      },
      gpu: gl ? {
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        contextAttributes: gl.getContextAttributes(),
      } : null,
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height,
      } : null,
    };
  });
}

let browser;
try {
  const localUrl = new URL(pilotUrl);
  if (!['http:', 'https:'].includes(localUrl.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(localUrl.hostname)
      || localUrl.username || localUrl.password) {
    throw new Error('PILOT_URL must be a local HTTP(S) Vite URL without credentials.');
  }
  const timeline = JSON.parse(await readFile(path.join(root, 'config', 'pilot.timeline.json'), 'utf8'));
  const sceneSource = await readFile(path.join(root, 'src', 'scene.ts'), 'utf8');
  report.environment.atlasFontStackFromSource = sceneSource.match(/^const FONT_STACK = '([^']+)';/m)?.[1] || null;
  report.environment.sceneSourceSha256 = sha256(sceneSource);
  const seed = timeline.timing.random_seed;
  report.seed = seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Timeline seed must be uint32.');
  const { chromium } = await import('playwright');
  const require = createRequire(import.meta.url);
  report.environment.playwright = JSON.parse(await readFile(require.resolve('playwright/package.json'), 'utf8')).version;
  browser = await chromium.launch({ headless: true, ...(requestedChannel ? { channel: requestedChannel } : {}) });
  report.environment.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
    if (message.type() === 'warning') report.consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => report.pageErrors.push(errorText(error)));
  page.on('requestfailed', (request) => report.failedRequests.push({
    url: request.url(), failure: request.failure()?.errorText || 'unknown',
  }));
  const response = await page.goto(pilotUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!check('local Vite page loaded successfully', response?.ok() === true, { httpStatus: response?.status() ?? null })) {
    throw new Error('Local Vite page did not load successfully.');
  }
  await page.waitForFunction(() => window.pilotReady != null && typeof window.renderFrame === 'function');
  const readyIsPromise = await page.evaluate(() => typeof window.pilotReady?.then === 'function');
  if (!check('pilotReady is awaitable', readyIsPromise)) throw new Error('window.pilotReady must be a Promise.');
  await withTimeout(page.evaluate(async () => { await window.pilotReady; await document.fonts.ready; }), 30_000, 'pilotReady and fonts');
  await page.locator('canvas#pilot-canvas').waitFor({ state: 'visible' });
  report.environment.browser = await browserEnvironment(page);
  const canvasSize = report.environment.browser.canvas;
  check('canvas has 960x540 backing and displayed dimensions', canvasSize?.width === previewSize.width
    && canvasSize?.height === previewSize.height
    && canvasSize?.cssWidth === previewSize.width && canvasSize?.cssHeight === previewSize.height, canvasSize || {});
  check('document fonts are ready', report.environment.browser.fonts.status === 'loaded');

  for (const frame of boundaryFrames) {
    try {
      const { snapshot } = await render(page, frame, seed);
      report.boundaryFrames.push({ frame, rendered: true, snapshot });
      validateSnapshot(snapshot, frame, timeline, `boundary frame ${frame} timing/shot/finite state`);
    } catch (error) {
      const message = errorText(error);
      report.boundaryFrames.push({ frame, rendered: false, error: message });
      check(`boundary frame ${frame} timing/shot/finite state`, false, { error: message });
    }
  }

  const invalidCases = [
    { frame: 900, seed, label: 'frame 900' },
    { frame: -1, seed, label: 'negative frame' },
    { frame: 0.5, seed, label: 'fractional frame' },
    { frame: Number.NaN, seed, label: 'NaN frame' },
    { frame: Number.POSITIVE_INFINITY, seed, label: 'infinite frame' },
    { frame: 0, seed: -1, label: 'negative seed' },
    { frame: 0, seed: 0x1_0000_0000, label: 'seed greater than uint32' },
    { frame: 0, seed: 0.5, label: 'fractional seed' },
    { frame: 0, seed: Number.NaN, label: 'NaN seed' },
    { frame: 0, seed: Number.POSITIVE_INFINITY, label: 'infinite seed' },
  ];
  for (const testCase of invalidCases) {
    // Catch the rejection inside evaluate: a normal input rejection is not a pageerror.
    const rejection = await page.evaluate(async ({ frame, seed }) => {
      try { await window.renderFrame(frame, seed); return { rejected: false, error: null }; }
      catch (error) { return { rejected: true, error: `${error.name}: ${error.message}` }; }
    }, { frame: testCase.frame, seed: testCase.seed });
    report.invalidInputs.push({ label: testCase.label, ...rejection });
    check(`reject ${testCase.label}`, rejection.rejected, rejection);
  }

  for (const endpointSeed of [0, 0xffffffff]) {
    try {
      const { snapshot } = await render(page, 0, endpointSeed);
      report.acceptedSeedEndpoints.push({ seed: endpointSeed, accepted: true, snapshot });
      validateSnapshot(snapshot, 0, timeline, `accept uint32 seed ${endpointSeed}`);
    } catch (error) {
      const message = errorText(error);
      report.acceptedSeedEndpoints.push({ seed: endpointSeed, accepted: false, error: message });
      check(`accept uint32 seed ${endpointSeed}`, false, { error: message });
    }
  }

  await mkdir(outputDirectory, { recursive: true });
  const baseline = new Map();
  for (const frame of keyframes) {
    const rendered = await render(page, frame, seed, true);
    validateSnapshot(rendered.snapshot, frame, timeline, `keyframe ${frame} finite scene state`);
    const filename = `frame-${String(frame).padStart(3, '0')}.png`;
    const png = await page.locator('canvas#pilot-canvas').screenshot({ type: 'png', animations: 'disabled', scale: 'css' });
    await writeFile(path.join(outputDirectory, filename), png);
    const entry = {
      frame, file: `${outputRelative}/${filename}`, pngSha256: sha256(png), pngDimensions: pngDimensions(png),
      snapshot: rendered.snapshot, pixels: rendered.pixels,
    };
    report.keyframes.push(entry);
    baseline.set(frame, entry);
    check(`keyframe ${frame} PNG is 960x540`, entry.pngDimensions.width === previewSize.width
      && entry.pngDimensions.height === previewSize.height, entry.pngDimensions);
    check(`keyframe ${frame} has bright content beyond the dark background`, rendered.pixels.readPixelsError === 0
      && rendered.pixels.nonBlackPixels > 0 && rendered.pixels.brightPixelsAtLeast64 > 200, rendered.pixels);
  }

  const frame0 = baseline.get(0);
  const frame36 = baseline.get(36);
  check('frame 36 changes visible pixels from frame 0', frame0.pngSha256 !== frame36.pngSha256
    && frame0.pixels.rawPixelSha256 !== frame36.pixels.rawPixelSha256,
  { frame0PngSha256: frame0.pngSha256, frame36PngSha256: frame36.pngSha256,
    frame0PixelSha256: frame0.pixels.rawPixelSha256, frame36PixelSha256: frame36.pixels.rawPixelSha256 });
  check('S01 character IDs stay fixed across keyframes', report.keyframes.every((entry) =>
    entry.snapshot.characterIdHash === frame0.snapshot.characterIdHash
    && entry.snapshot.characterCount === frame0.snapshot.characterCount),
  { characterIdHashes: report.keyframes.map((entry) => entry.snapshot.characterIdHash) });

  for (const alternativeSeed of [0, 0xffffffff]) {
    const changed = await render(page, 36, alternativeSeed, true);
    validateSnapshot(changed.snapshot, 36, timeline, `alternative seed ${alternativeSeed} finite scene state`);
    const restored = await render(page, 36, seed, true);
    const restoredPng = await page.locator('canvas#pilot-canvas').screenshot({ type: 'png', animations: 'disabled', scale: 'css' });
    const restoration = {
      frame: 36,
      alternativeSeed,
      alternativePixelSha256: changed.pixels.rawPixelSha256,
      restoredDefaultSeed: seed,
      restoredPngSha256: sha256(restoredPng),
      restoredPixelSha256: restored.pixels.rawPixelSha256,
      pngHashMatches: sha256(restoredPng) === frame36.pngSha256,
      pixelHashMatches: restored.pixels.rawPixelSha256 === frame36.pixels.rawPixelSha256,
      snapshotMatches: JSON.stringify(restored.snapshot) === JSON.stringify(frame36.snapshot),
    };
    report.seedRestoration.push(restoration);
    check(`restore default seed after ${alternativeSeed}`, restoration.pngHashMatches
      && restoration.pixelHashMatches && restoration.snapshotMatches, restoration);
  }

  for (const frame of repeatOrder) {
    const rendered = await render(page, frame, seed, true);
    validateSnapshot(rendered.snapshot, frame, timeline, `repeat frame ${frame} finite scene state`);
    const png = await page.locator('canvas#pilot-canvas').screenshot({ type: 'png', animations: 'disabled', scale: 'css' });
    const expected = baseline.get(frame);
    const repeated = { frame, pngSha256: sha256(png), pixels: rendered.pixels,
      pngHashMatches: sha256(png) === expected.pngSha256,
      pixelHashMatches: rendered.pixels.rawPixelSha256 === expected.pixels.rawPixelSha256,
      snapshotMatches: JSON.stringify(rendered.snapshot) === JSON.stringify(expected.snapshot) };
    report.repeatedFrames.push(repeated);
    check(`out-of-order frame ${frame} reproduces baseline`, repeated.pngHashMatches
      && repeated.pixelHashMatches && repeated.snapshotMatches, repeated);
  }
  // Flush pending browser tasks before deciding whether runtime errors occurred.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('no browser console errors', report.consoleErrors.length === 0, { errors: report.consoleErrors });
  check('no unhandled JavaScript page errors', report.pageErrors.length === 0, { errors: report.pageErrors });
  check('no failed browser requests', report.failedRequests.length === 0, { requests: report.failedRequests });
} catch (error) {
  report.fatalErrors.push(errorText(error));
} finally {
  if (browser) {
    try { await browser.close(); }
    catch (error) { report.fatalErrors.push(`Browser close: ${errorText(error)}`); }
  }
  report.completedAt = new Date().toISOString();
  const passed = report.checks.length > 0 && report.checks.every((item) => item.passed)
    && report.fatalErrors.length === 0 && report.consoleErrors.length === 0 && report.pageErrors.length === 0
    && report.failedRequests.length === 0 && report.keyframes.length === 3
    && report.boundaryFrames.length === boundaryFrames.length && report.repeatedFrames.length === repeatOrder.length
    && report.seedRestoration.length === 2;
  report.status = passed ? 'PASS' : 'FAIL';
  try {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`${report.status}: ${report.checks.filter((item) => item.passed).length}/${report.checks.length} browser checks; ${report.keyframes.length} actual canvas PNGs.`);
    console.log(`Report: ${outputRelative}/browser-report.json`);
  } catch (error) {
    console.error(`FAIL: Could not save browser report: ${errorText(error)}`);
    process.exitCode = 1;
  }
  if (!passed) {
    for (const error of report.fatalErrors) console.error(error);
    for (const failure of report.checks.filter((item) => !item.passed)) console.error(`Failed check: ${failure.name}`);
    process.exitCode = 1;
  }
}
