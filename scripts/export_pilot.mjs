#!/usr/bin/env node
/** Offline PNG streaming export; start the local Vite preview separately. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'reviews', 'pilot-v2');
const outputRelative = 'reviews/pilot-v2/preview-960x540.mp4';
const output = path.join(root, outputRelative);
const url = process.env.PILOT_URL || 'http://127.0.0.1:4173';
const channel = process.env.PILOT_BROWSER_CHANNEL || 'msedge';
const executable = process.env.PILOT_FFMPEG;
const overwrite = process.argv.slice(2).includes('--overwrite');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  schemaVersion: 1, status: 'FAIL', startedAt: new Date().toISOString(), completedAt: null,
  method: 'awaited arbitrary-frame rendering; PNG image2pipe; no realtime recording',
  environment: { node: process.version, platform: process.platform, browserChannel: channel },
  output: { file: outputRelative }, captures: 0, captureHashes: [], sourceCodeSha256: {},
  browserErrors: [], errors: [], checks: [],
  limitations: ['Engineering export checks do not establish artistic, beat, or lyric acceptance.',
    'Rendering is measured in the recorded browser and GPU environment; cross-hardware pixel identity is not claimed.'],
};
let browser;
let encoder;
let encoderResult;
let encodeLog = '';
let decodeLog = '';
let decodedOutput = '';
let reportPath = path.join(directory, 'export-report.json');
const children = new Set();

function requireCheck(name, passed, details = {}) {
  report.checks.push({ name, passed: Boolean(passed), details });
  if (!passed) throw new Error(`Check failed: ${name}`);
}

function start(args, input = false, onStderr = () => {}, onStdout = () => {}) {
  const child = spawn(executable, args, { cwd: root, shell: false, windowsHide: true,
    stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  children.add(child);
  // Always observe the rejection immediately, including during the capture loop.
  const completion = new Promise((resolve) => {
    let error = null;
    child.on('error', (reason) => { error = reason.message; });
    child.stdout.on('data', (chunk) => onStdout(chunk.toString()));
    child.stderr.on('data', (chunk) => onStderr(chunk.toString()));
    if (child.stdin) child.stdin.on('error', (reason) => { error ||= reason.message; });
    child.on('close', (code, signal) => {
      children.delete(child);
      resolve({ code, signal, error });
    });
  });
  return { child, completion };
}

async function command(args) {
  let stdout = '';
  let stderr = '';
  const process = start(args, false, (text) => { stderr += text; }, (text) => { stdout += text; });
  return { ...(await process.completion), stdout, stderr };
}

async function timeout(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function streamPng(bytes) {
  if (!encoder.stdin || encoder.stdin.destroyed || encoder.exitCode !== null) {
    throw new Error('FFmpeg encoder stopped before all frames were submitted.');
  }
  if (encoder.stdin.write(bytes)) return;
  await timeout(new Promise((resolve, reject) => {
    const cleanup = () => {
      encoder.stdin.off('drain', drained);
      encoder.stdin.off('error', failed);
      encoder.off('close', closed);
    };
    const drained = () => { cleanup(); resolve(); };
    const failed = (error) => { cleanup(); reject(error); };
    const closed = () => failed(new Error('FFmpeg closed while waiting for PNG stream drain.'));
    encoder.stdin.once('drain', drained);
    encoder.stdin.once('error', failed);
    encoder.once('close', closed);
  }), 30_000, 'PNG stream drain');
}

function numericValues(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numericValues);
  return [];
}

try {
  if (process.argv.slice(2).some((arg) => arg !== '--overwrite')) throw new Error('Only --overwrite is supported.');
  if (!executable) throw new Error('Set PILOT_FFMPEG to the available FFmpeg executable.');
  await access(executable);
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)
      || parsedUrl.username || parsedUrl.password) throw new Error('PILOT_URL must be a local HTTP(S) URL without credentials.');
  let outputExists = false;
  try { await access(output); outputExists = true; } catch { /* First export. */ }
  if (outputExists && !overwrite) {
    reportPath = path.join(directory, `export-refused-${Date.now()}.json`);
    throw new Error('Output already exists. Use --overwrite to replace only preview-960x540.mp4.');
  }
  await mkdir(directory, { recursive: true });
  const timeline = JSON.parse(await readFile(path.join(root, 'config', 'pilot.timeline.json'), 'utf8'));
  requireCheck('configured 900 frames / 60fps / 960x540 / trimmed audio offset zero',
    timeline.video.total_frames === 900 && timeline.video.fps_num === 60 && timeline.video.fps_den === 1
    && timeline.preview.width === 960 && timeline.preview.height === 540 && timeline.audio.playback_offset_seconds === 0);
  const seed = timeline.timing.random_seed;
  requireCheck('uint32 seed', Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  report.seed = seed;
  report.url = url;
  for (const file of ['src/main.ts', 'src/scene.ts', 'src/character.ts', 'src/direction.ts', 'src/timeline.ts',
    'config/pilot.timeline.json', 'pnpm-lock.yaml', 'scripts/export_pilot.mjs']) {
    report.sourceCodeSha256[file] = sha(await readFile(path.join(root, file)));
  }
  const version = await command(['-version']);
  requireCheck('FFmpeg executable responds', version.code === 0 && !version.error);
  report.environment.ffmpeg = { executableName: path.basename(executable), sha256: sha(await readFile(executable)), version: version.stdout.split('\n')[0] };
  const require = createRequire(import.meta.url);
  report.environment.playwright = JSON.parse(await readFile(require.resolve('playwright/package.json'), 'utf8')).version;
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, channel });
  report.environment.browserVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => report.browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') report.browserErrors.push(message.text()); });
  page.on('requestfailed', (request) => report.browserErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  requireCheck('local preview loaded', response?.ok() === true);
  await page.waitForFunction(() => window.pilotReady && typeof window.renderFrame === 'function');
  await timeout(page.evaluate(async () => { await window.pilotReady; await document.fonts.ready; }), 30_000, 'pilotReady');
  report.environment.browser = await page.evaluate(() => {
    const canvas = document.querySelector('#pilot-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      fontsStatus: document.fonts.status, width: canvas.width, height: canvas.height };
  });
  const audioRelative = timeline.audio.path;
  const resolvedAudio = path.resolve(root, audioRelative);
  const audioWithinRoot = path.relative(root, resolvedAudio);
  requireCheck('audio path stays within project', !audioWithinRoot.startsWith('..') && !path.isAbsolute(audioWithinRoot));
  await access(resolvedAudio);
  report.sourceCodeSha256[audioRelative] = sha(await readFile(resolvedAudio));
  const args = ['-hide_banner', overwrite ? '-y' : '-n', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', '60', '-i', 'pipe:0',
    '-i', audioRelative, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', '60', '-frames:v', '900', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
    '-t', '15', '-movflags', '+faststart', outputRelative];
  report.encoderArgs = args;
  const started = start(args, true, (text) => { encodeLog += text; });
  encoder = started.child;
  encoderResult = started.completion;
  let idHash;
  let characterCount;
  for (let frame = 0; frame < 900; frame++) {
    const capture = await timeout(page.evaluate(async ({ frame, seed }) => {
      const snapshot = await window.renderFrame(frame, seed);
      const canvas = document.querySelector('canvas#pilot-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing pilot canvas.');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl || gl.isContextLost()) throw new Error('Unavailable or lost WebGL context.');
      gl.finish();
      const glError = gl.getError();
      return { snapshot, width: canvas.width, height: canvas.height, glError, png: canvas.toDataURL('image/png').split(',')[1] };
    }, { frame, seed }), 30_000, `renderFrame ${frame}`);
    const snapshot = capture.snapshot;
    const expectedShot = timeline.shots.find((shot) => frame >= shot.first_frame && frame < shot.last_frame_exclusive);
    if (frame === 0) { idHash = snapshot.characterIdHash; characterCount = snapshot.characterCount; }
    if (snapshot.frame !== frame || snapshot.shotId !== expectedShot?.id || snapshot.finite !== true || snapshot.implemented !== true
      || !numericValues(snapshot).every(Number.isFinite) || snapshot.characterIdHash !== idHash || snapshot.characterCount !== characterCount
      || typeof idHash !== 'string' || !idHash || !Number.isInteger(characterCount) || characterCount < 1
      || !Number.isFinite(snapshot.localSeconds) || !Number.isFinite(snapshot.sourceSeconds)
      || Math.abs(snapshot.localSeconds - frame / 60) > 1e-9 || Math.abs(snapshot.sourceSeconds - (58 + frame / 60)) > 1e-9
      || capture.width !== 960 || capture.height !== 540 || capture.glError !== 0) throw new Error(`Invalid capture evidence at frame ${frame}.`);
    const png = Buffer.from(capture.png, 'base64');
    if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || png.readUInt32BE(16) !== 960 || png.readUInt32BE(20) !== 540) throw new Error(`Invalid PNG at frame ${frame}.`);
    await streamPng(png);
    report.captureHashes.push({ frame, sha256: sha(png) });
    report.captures++;
    if (report.captures % 120 === 0 || report.captures === 900) console.log(`Captured ${report.captures}/900 offline frames.`);
  }
  report.character = { idHash, count: characterCount };
  encoder.stdin.end();
  const encoded = await timeout(encoderResult, 120_000, 'FFmpeg encoding completion');
  report.encoderResult = encoded;
  requireCheck('encoder completed after 900 captures', encoded.code === 0 && !encoded.error && report.captures === 900, encoded);
  const decoderArgs = ['-hide_banner', '-i', outputRelative, '-map', '0:v:0', '-an', '-f', 'framemd5', '-'];
  report.decoderArgs = decoderArgs;
  const decoded = await timeout(command(decoderArgs), 120_000, 'FFmpeg full video decode');
  decodeLog = decoded.stderr;
  decodedOutput = decoded.stdout;
  requireCheck('full video decoder exit zero', decoded.code === 0 && !decoded.error, { code: decoded.code, error: decoded.error });
  const rows = decoded.stdout.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split(',').map((field) => field.trim()));
  const timebase = decoded.stdout.match(/^#tb\s+0:\s*(\S+)/m)?.[1];
  const hashes = rows.map((row) => row[5]);
  const uniqueHashes = new Set(hashes).size;
  report.decoder = { frameCount: rows.length, timebase, uniqueFrameHashes: uniqueHashes,
    firstPts: Number(rows[0]?.[2]), lastPts: Number(rows.at(-1)?.[2]),
    sequentialPts: rows.every((row, index) => row.length === 6 && Number(row[0]) === 0 && Number(row[2]) === index && Number(row[3]) === 1),
    adjacentDuplicateFrames: hashes.filter((hash, index) => index > 0 && hash === hashes[index - 1]).length,
    decodedFrameMd5Sha256: sha(decoded.stdout) };
  requireCheck('decoded 900 frames / timebase 1/60 / ordered PTS 0..899', rows.length === 900 && timebase === '1/60' && report.decoder.sequentialPts);
  requireCheck('decoded video is not entirely repeated', uniqueHashes > 1);
  const videoLine = decodeLog.split(/\r?\n/).find((line) => /Stream #0:.*Video:/.test(line));
  const audioLine = decodeLog.split(/\r?\n/).find((line) => /Stream #0:.*Audio:/.test(line));
  const duration = decodeLog.match(/Duration:\s*(\d+:\d+:\d+\.\d+)/)?.[1];
  report.media = { duration, video: videoLine?.trim(), audio: audioLine?.trim(), metadataMethod: 'FFmpeg input metadata plus full video framemd5 decode' };
  requireCheck('actual MP4 H264 / yuv420p / 960x540 / 60fps', /Video:\s*h264/.test(videoLine || '') && /yuv420p/.test(videoLine || '')
    && /960x540/.test(videoLine || '') && /\b60 fps\b/.test(videoLine || ''));
  requireCheck('actual AAC / 48000Hz / stereo / 15.00 seconds', /Audio:\s*aac/.test(audioLine || '')
    && /48000 Hz/.test(audioLine || '') && /stereo/.test(audioLine || '') && duration === '00:00:15.00');
  const audioDecode = await timeout(command(['-hide_banner', '-i', outputRelative, '-map', '0:a:0', '-vn', '-f', 'null', '-']), 120_000, 'AAC decode');
  report.audioDecoder = { code: audioDecode.code, error: audioDecode.error };
  decodeLog += `\n--- AAC full decode ---\n${audioDecode.stderr}`;
  requireCheck('actual AAC fully decodes', audioDecode.code === 0 && !audioDecode.error);
  requireCheck('no browser errors during export', report.browserErrors.length === 0, { errors: report.browserErrors });
  report.output.bytes = (await stat(output)).size;
  report.output.sha256 = sha(await readFile(output));
  requireCheck('nonempty MP4 exists', report.output.bytes > 0);
  report.status = 'PASS';
} catch (error) {
  report.errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill();
  if (encoderResult) await timeout(encoderResult, 10_000, 'encoder shutdown').catch((error) => report.errors.push(error.message));
  if (browser) await browser.close().catch((error) => { report.errors.push(error.message); report.status = 'FAIL'; process.exitCode = 1; });
  report.completedAt = new Date().toISOString();
  if (report.errors.length) { report.status = 'FAIL'; process.exitCode = 1; }
  await mkdir(directory, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  // Keep a previously verified export's logs when a default overwrite refusal occurs.
  if (path.basename(reportPath) === 'export-report.json') {
    await writeFile(path.join(directory, 'ffmpeg-encode.log.txt'), encodeLog, 'utf8');
    await writeFile(path.join(directory, 'ffmpeg-decode.log.txt'), decodeLog, 'utf8');
    await writeFile(path.join(directory, 'decoded-frames.framemd5.txt'), decodedOutput, 'utf8');
  }
  console.log(`${report.status}: ${report.captures}/900 captured; report ${path.relative(root, reportPath).split(path.sep).join('/')}`);
  for (const error of report.errors) console.error(error);
}
