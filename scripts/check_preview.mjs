#!/usr/bin/env node
/** UI and local audio playback smoke check; start Vite preview separately. */
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
const output = path.join(outputDirectory, 'ui-report.json');
const url = process.env.PILOT_URL || 'http://127.0.0.1:4173';
const channel = process.env.PILOT_BROWSER_CHANNEL || 'msedge';
const report = {
  schemaVersion: 1, status: 'FAIL', startedAt: new Date().toISOString(), completedAt: null,
  url, environment: { node: process.version, platform: process.platform, channel, headless: true, muteAudio: true },
  checks: [], pageErrors: [], consoleObservations: [], requestFailures: [], audioEvents: [], fatalErrors: [],
  limitations: [
    'Playwright ran with --mute-audio; no human listening review was performed.',
    'This checks browser playback and frame controls only; lyric, beat, and artistic synchronization remain unverified.',
    'FLAC ERR_ABORTED observations can represent normal range-request cancellation; audio.error and actual playback are checked separately.',
  ],
};
function check(name, passed, details = {}) {
  report.checks.push({ name, passed: Boolean(passed), details });
  return Boolean(passed);
}
function errorText(error) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error); }
function hash(text) { return createHash('sha256').update(text).digest('hex'); }
async function timeout(operation, label, milliseconds = 20_000) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function state(page) {
  return page.evaluate(() => {
    const audio = document.querySelector('#pilot-audio');
    return {
      frameInput: Number(document.querySelector('#frame-input').value),
      frameCount: document.querySelector('#frame-count').textContent,
      shotHeading: document.querySelector('#shot-heading').textContent,
      implementation: document.querySelector('#implementation').textContent,
      errorVisible: !document.querySelector('#error').hidden,
      errorText: document.querySelector('#error').textContent,
      audio: {
        currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null,
        paused: audio.paused, ended: audio.ended, src: audio.currentSrc || audio.src,
        readyState: audio.readyState, networkState: audio.networkState,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      },
    };
  });
}

let browser;
try {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('PILOT_URL must be a local HTTP(S) URL without credentials.');
  }
  const timeline = JSON.parse(await readFile(path.join(root, 'config', 'pilot.timeline.json'), 'utf8'));
  const { chromium } = await import('playwright');
  const require = createRequire(import.meta.url);
  report.environment.playwright = JSON.parse(await readFile(require.resolve('playwright/package.json'), 'utf8')).version;
  browser = await chromium.launch({ channel, headless: true, args: ['--mute-audio'] });
  report.environment.browserVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => report.pageErrors.push(errorText(error)));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) report.consoleObservations.push({ type: message.type(), text: message.text() });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'unknown';
    const isFlac = new URL(request.url()).pathname.toLowerCase().endsWith('.flac');
    report.requestFailures.push({ url: request.url(), method: request.method(), failure,
      expectedRangeCancellation: isFlac && failure.includes('ERR_ABORTED') });
  });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if (!check('local preview page loads', response?.ok() === true, { httpStatus: response?.status() })) throw new Error('Preview page failed.');
  await page.waitForFunction(() => typeof window.renderFrame === 'function' && typeof window.pilotReady?.then === 'function');
  await timeout(page.evaluate(async () => { await window.pilotReady; }), 'pilotReady');
  await page.evaluate(() => {
    const audio = document.querySelector('#pilot-audio');
    window.__previewAudioEvents = [];
    for (const type of ['loadedmetadata', 'playing', 'pause', 'seeked', 'waiting', 'stalled', 'error']) {
      audio.addEventListener(type, () => window.__previewAudioEvents.push({
        type, currentTime: audio.currentTime, paused: audio.paused,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      }));
    }
  });

  await page.getByRole('button', { name: '036', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#frame-input').value === '36');
  let observed = await state(page);
  check('keyframe 036 button seeks to frame 36 in S01', observed.frameInput === 36 && observed.shotHeading.startsWith('S01'), observed);

  await page.locator('[data-shot="S02"]').click();
  await page.waitForFunction(() => document.querySelector('#frame-input').value === '72');
  observed = await state(page);
  check('S02 navigation seeks to 72 and states it is unimplemented', observed.frameInput === 72
    && observed.shotHeading.startsWith('S02') && observed.implementation.includes('待实现'), observed);
  const beforeInvalid = hash(await page.locator('#pilot-canvas').evaluate((canvas) => canvas.toDataURL('image/png')));
  const countBeforeInvalid = observed.frameCount;
  const input = page.locator('#frame-input');
  await input.fill('900');
  await input.dispatchEvent('change');
  await page.waitForFunction(() => !document.querySelector('#error').hidden);
  observed = await state(page);
  const afterInvalid = hash(await page.locator('#pilot-canvas').evaluate((canvas) => canvas.toDataURL('image/png')));
  check('invalid frame 900 reports an error and leaves rendered state unchanged', observed.errorVisible
    && observed.errorText.length > 0 && observed.frameCount === countBeforeInvalid && observed.shotHeading.startsWith('S02')
    && beforeInvalid === afterInvalid, { ...observed, beforeCanvasSha256: beforeInvalid, afterCanvasSha256: afterInvalid });

  await input.fill('0');
  await input.dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('#frame-count').textContent.startsWith('000') && document.querySelector('#error').hidden);
  observed = await state(page);
  check('recover to frame 0 and local audio zero before playback', observed.frameInput === 0
    && observed.audio.paused && Math.abs(observed.audio.currentTime) < 0.01 && !observed.errorVisible, observed);
  await page.getByRole('button', { name: '试听预览', exact: true }).click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('#pilot-audio');
    return !audio.paused && audio.currentTime > 0.15 && Number.isFinite(audio.duration);
  }, null, { timeout: 15_000 });
  observed = await state(page);
  check('local audio advances during preview', !observed.audio.paused && observed.audio.currentTime > 0.15
    && observed.audio.currentTime < 15 && observed.audio.error === null, observed);
  const audioUrl = new URL(observed.audio.src);
  check('audio is the local 15-second pre-cut FLAC without another 58-second offset',
    audioUrl.origin === parsed.origin && /pilot_058-073[^/]*\.flac$/i.test(audioUrl.pathname)
    && Math.abs(observed.audio.duration - 15) < 0.05 && observed.audio.currentTime < 15
    && timeline.audio.playback_offset_seconds === 0, { audio: observed.audio, configuredAudio: timeline.audio });

  await page.getByRole('button', { name: '暂停试听', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#pilot-audio').paused);
  observed = await state(page);
  const expectedFrame = Math.floor(observed.audio.currentTime * 60);
  check('pause leaves a frame within 2 of the audio clock', observed.audio.paused
    && Math.abs(observed.frameInput - expectedFrame) <= 2, { ...observed, expectedFrame });
  const snapshot = await timeout(page.evaluate(async (seed) => await window.renderFrame(36, seed), timeline.timing.random_seed), 'renderFrame 36');
  observed = await state(page);
  check('offline renderFrame 36 pauses playback and selects exactly 36', observed.audio.paused
    && observed.frameInput === 36 && snapshot.frame === 36 && snapshot.shotId === 'S01', { ...observed, snapshot });
  report.audioEvents = await page.evaluate(() => window.__previewAudioEvents);
  check('audio decoder has no error', observed.audio.error === null && report.audioEvents.every((event) => event.error === null),
    { audio: observed.audio, events: report.audioEvents });
  check('no unhandled JavaScript page errors', report.pageErrors.length === 0, { errors: report.pageErrors });
  const unexpectedFailures = report.requestFailures.filter((request) => !request.expectedRangeCancellation);
  check('no unexpected network failures', unexpectedFailures.length === 0, { unexpectedFailures });
} catch (error) {
  report.fatalErrors.push(errorText(error));
} finally {
  if (browser) {
    try { await browser.close(); } catch (error) { report.fatalErrors.push(`Browser close: ${errorText(error)}`); }
  }
  report.completedAt = new Date().toISOString();
  const passed = report.checks.length === 12 && report.checks.every((item) => item.passed)
    && report.pageErrors.length === 0 && report.fatalErrors.length === 0;
  report.status = passed ? 'PASS' : 'FAIL';
  try {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`${report.status}: ${report.checks.filter((item) => item.passed).length}/${report.checks.length} UI/audio smoke checks.`);
    console.log(`Report: ${path.relative(root, output).split(path.sep).join('/')}; muted engineering playback only, no listening review.`);
  } catch (error) { console.error(`FAIL saving UI report: ${errorText(error)}`); process.exitCode = 1; }
  if (!passed) {
    for (const error of report.fatalErrors) console.error(error);
    for (const failure of report.checks.filter((item) => !item.passed)) console.error(`Failed check: ${failure.name}`);
    process.exitCode = 1;
  }
}
