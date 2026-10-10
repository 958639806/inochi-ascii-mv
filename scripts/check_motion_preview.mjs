#!/usr/bin/env node
/** S01 silent-loop controls smoke check. Start the local Vite preview separately. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'reviews', 't01-motion');
const url = process.env.PILOT_URL || 'http://127.0.0.1:4173';
const channel = process.env.PILOT_BROWSER_CHANNEL || 'msedge';
const report = {
  schemaVersion: 1, status: 'FAIL', startedAt: new Date().toISOString(), completedAt: null, url,
  environment: { node: process.version, platform: process.platform, channel, headless: true, muteAudio: true,
    viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
  checks: [], loopSamples: [], pageErrors: [], consoleObservations: [], requestFailures: [], artifacts: [], fatalErrors: [],
  limitations: [
    'Frame samples test loop scheduling and control behavior, not artistic acceptance or perceptual motion quality.',
    'The single workbench screenshot shows button placement; it is not an exported animation keyframe.',
    'Browser audio is muted; no human listening review, lyric alignment, or beat alignment was performed.',
    'Offline renderFrame remains frame-driven; wall-clock sampling is used only to observe live preview controls.',
  ],
};
function check(name, passed, details = {}) {
  report.checks.push({ name, passed: Boolean(passed), details });
  return Boolean(passed);
}
function errorText(error) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error); }
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
      observedAtMs: performance.now(),
      frame: Number(document.querySelector('#frame-input').value),
      shotHeading: document.querySelector('#shot-heading').textContent,
      loopButton: document.querySelector('#loop-s01').textContent.trim(),
      playButton: document.querySelector('#play').textContent.trim(),
      audio: {
        currentTime: audio.currentTime, paused: audio.paused,
        duration: Number.isFinite(audio.duration) ? audio.duration : null,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
      },
    };
  });
}
function stable(left, right) {
  return left.frame === right.frame && left.audio.paused && right.audio.paused
    && Math.abs(left.audio.currentTime - right.audio.currentTime) < 0.01;
}

let browser;
try {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('PILOT_URL must be a local HTTP(S) URL without credentials.');
  }
  const timeline = JSON.parse(await readFile(path.join(root, 'config', 'pilot.timeline.json'), 'utf8'));
  const { chromium } = await import('playwright');
  const require = createRequire(import.meta.url);
  report.environment.playwright = JSON.parse(await readFile(require.resolve('playwright/package.json'), 'utf8')).version;
  browser = await chromium.launch({ channel, headless: true, args: ['--mute-audio'] });
  report.environment.browserVersion = browser.version();
  const page = await browser.newPage({ viewport: report.environment.viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => report.pageErrors.push(errorText(error)));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) report.consoleObservations.push({ type: message.type(), text: message.text() });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'unknown';
    report.requestFailures.push({ url: request.url(), failure,
      expectedRangeCancellation: new URL(request.url()).pathname.endsWith('.flac') && failure.includes('ERR_ABORTED') });
  });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if (!check('local preview loads', response?.ok() === true, { httpStatus: response?.status() })) throw new Error('Preview failed to load.');
  await page.waitForFunction(() => typeof window.renderFrame === 'function' && typeof window.pilotReady?.then === 'function');
  await timeout(page.evaluate(async () => { await window.pilotReady; }), 'pilotReady');
  const loop = page.locator('#loop-s01');
  await loop.waitFor({ state: 'visible' });
  check('S01 loop button is enabled and clearly labeled', await loop.isEnabled()
    && (await loop.textContent()).trim() === '循环看 S01');
  const beforeLoop = await state(page);
  await loop.click();
  await page.waitForFunction(() => document.querySelector('#loop-s01').textContent.trim() === '停止循环');
  for (let index = 0; index < 10; index += 1) {
    if (index > 0) await page.waitForTimeout(200);
    report.loopSamples.push(await state(page));
  }
  check('all loop samples stay inside S01 frames 0 through 71', report.loopSamples.every((sample) =>
    Number.isInteger(sample.frame) && sample.frame >= 0 && sample.frame < 72
    && sample.shotHeading.startsWith('S01') && sample.loopButton === '停止循环'), { samples: report.loopSamples });
  const distinctFrames = [...new Set(report.loopSamples.map((sample) => sample.frame))];
  check('loop frame values change across real time samples', distinctFrames.length > 1, { distinctFrames });
  const observedWraps = report.loopSamples.slice(1).filter((sample, index) => sample.frame < report.loopSamples[index].frame).length;
  check('S01 loop wraps back to an earlier frame', observedWraps > 0, { observedWraps });
  check('silent loop pauses audio and does not advance its clock', report.loopSamples.every((sample) =>
    sample.audio.paused && Math.abs(sample.audio.currentTime - beforeLoop.audio.currentTime) < 0.01),
  { beforeAudio: beforeLoop.audio, sampledAudio: report.loopSamples.map((sample) => sample.audio) });
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, 'workbench-loop.png'), fullPage: false });
  report.artifacts.push({ file: 'reviews/t01-motion/workbench-loop.png', kind: 'workbench UI screenshot',
    purpose: 'Loop button placement only; not an animation keyframe.' });

  const snapshot = await timeout(page.evaluate(async (seed) => await window.renderFrame(36, seed), timeline.timing.random_seed), 'renderFrame 36');
  const rendered = await state(page);
  check('renderFrame 36 stops the loop and selects exactly 36', snapshot.frame === 36 && rendered.frame === 36
    && rendered.loopButton === '循环看 S01' && rendered.audio.paused, { snapshot, state: rendered });
  await page.waitForTimeout(150);
  const afterRenderWait = await state(page);
  check('offline frame 36 remains stable after 150ms', afterRenderWait.frame === 36 && stable(rendered, afterRenderWait),
    { before: rendered, after: afterRenderWait });

  await loop.click();
  await page.waitForFunction(() => document.querySelector('#loop-s01').textContent.trim() === '停止循环');
  await page.locator('#frame-input').fill('24');
  await page.locator('#frame-input').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('#frame-input').value === '24'
    && document.querySelector('#loop-s01').textContent.trim() === '循环看 S01');
  const sought = await state(page);
  await page.waitForTimeout(150);
  const afterSeekWait = await state(page);
  check('manual seek stops the loop and holds frame 24', sought.frame === 24 && afterSeekWait.frame === 24
    && stable(sought, afterSeekWait), { before: sought, after: afterSeekWait });

  await loop.click();
  await page.waitForFunction(() => document.querySelector('#loop-s01').textContent.trim() === '停止循环');
  await page.waitForTimeout(200);
  await loop.click();
  await page.waitForFunction(() => document.querySelector('#loop-s01').textContent.trim() === '循环看 S01');
  const stoppedLoop = await state(page);
  await page.waitForTimeout(150);
  const afterStopWait = await state(page);
  check('stop-loop button halts frame and audio advance', stable(stoppedLoop, afterStopWait),
    { before: stoppedLoop, after: afterStopWait });

  await loop.click();
  await page.waitForFunction(() => document.querySelector('#loop-s01').textContent.trim() === '停止循环');
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.querySelector('#pilot-audio').paused
    && document.querySelector('#play').textContent.trim() === '暂停试听');
  const playingStart = await state(page);
  check('audio preview stops the silent loop', playingStart.loopButton === '循环看 S01'
    && playingStart.playButton === '暂停试听' && !playingStart.audio.paused, playingStart);
  await page.waitForFunction((startTime) => {
    const audio = document.querySelector('#pilot-audio');
    return !audio.paused && audio.currentTime > startTime + 0.15;
  }, playingStart.audio.currentTime, { timeout: 15_000 });
  const playingLater = await state(page);
  check('audio clock advances in listening preview mode', playingLater.audio.currentTime > playingStart.audio.currentTime + 0.15
    && !playingLater.audio.paused && playingLater.loopButton === '循环看 S01', { before: playingStart, after: playingLater });
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#pilot-audio').paused);
  const paused = await state(page);
  await page.waitForTimeout(150);
  const afterPauseWait = await state(page);
  check('pause halts frame and audio advance', stable(paused, afterPauseWait)
    && afterPauseWait.loopButton === '循环看 S01', { before: paused, after: afterPauseWait });
  check('audio decoder reports no error', [...report.loopSamples, rendered, sought, stoppedLoop, playingStart,
    playingLater, paused, afterPauseWait].every((sample) => sample.audio.error === null));
  check('no unhandled JavaScript page errors', report.pageErrors.length === 0, { errors: report.pageErrors });
  const unexpected = report.requestFailures.filter((failure) => !failure.expectedRangeCancellation);
  check('no unexpected failed browser requests', unexpected.length === 0, { unexpected });
} catch (error) {
  report.fatalErrors.push(errorText(error));
} finally {
  if (browser) {
    try { await browser.close(); } catch (error) { report.fatalErrors.push(`Browser close: ${errorText(error)}`); }
  }
  report.completedAt = new Date().toISOString();
  const passed = report.checks.length === 16 && report.checks.every((item) => item.passed)
    && report.fatalErrors.length === 0 && report.pageErrors.length === 0 && report.loopSamples.length === 10;
  report.status = passed ? 'PASS' : 'FAIL';
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'motion-ui-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`${report.status}: ${report.checks.filter((item) => item.passed).length}/${report.checks.length} loop UI checks.`);
    console.log('Report: reviews/t01-motion/motion-ui-report.json; motion quality and listening remain pending review.');
  } catch (error) { console.error(`FAIL saving motion UI report: ${errorText(error)}`); process.exitCode = 1; }
  if (!passed) {
    for (const error of report.fatalErrors) console.error(error);
    for (const failure of report.checks.filter((item) => !item.passed)) console.error(`Failed check: ${failure.name}`);
    process.exitCode = 1;
  }
}
