#!/usr/bin/env python3
"""Validate this initial handoff snapshot. No network and no third-party dependencies."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
TARGET = '958639806/inochi-ascii-mv'

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def safe_path(root: Path, relative: str) -> Path:
    parts = PurePosixPath(relative)
    if parts.is_absolute() or not parts.parts or '..' in parts.parts or '\\' in relative:
        raise ValueError(f'Unsafe path: {relative}')
    if any(p in {'.git', '.env', 'node_modules', '__pycache__'} for p in parts.parts):
        raise ValueError(f'Forbidden path: {relative}')
    p = root.joinpath(*parts.parts)
    if any(root.joinpath(*parts.parts[:i]).is_symlink() for i in range(1, len(parts.parts)+1)):
        raise ValueError(f'Symlink not allowed: {relative}')
    if not p.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Path escaped package: {relative}')
    return p

def validate_package(root: Path = ROOT) -> list[str]:
    manifest = json.loads((root / 'package-manifest.json').read_text(encoding='utf-8'))
    if manifest.get('target_repository') != TARGET:
        raise ValueError('Unexpected target repository.')
    paths = []
    for item in manifest['files']:
        p = safe_path(root, item['path'])
        if not p.is_file() or p.stat().st_size != item['bytes'] or digest(p) != item['sha256']:
            raise ValueError(f'Initial package snapshot mismatch: {item["path"]}')
        if p.stat().st_size >= 50 * 1024 * 1024:
            raise ValueError(f'File too large for this handoff policy: {item["path"]}')
        paths.append(item['path'])
    if len(paths) != len(set(paths)):
        raise ValueError('Duplicate file entries.')
    return paths + ['package-manifest.json']

def validate_timeline(root: Path = ROOT) -> None:
    obj = json.loads((root / 'config/pilot.timeline.json').read_text(encoding='utf-8'))
    assert obj['video']['total_frames'] == 900
    assert (obj['video']['width'], obj['video']['height']) == (1920, 1080)
    assert (obj['video']['fps_num'], obj['video']['fps_den']) == (60, 1)
    cursor = 0
    for shot in obj['shots']:
        assert shot['first_frame'] == cursor
        assert shot['last_frame_exclusive'] > cursor
        assert abs(shot['source_start_seconds'] - (58 + cursor/60)) < 1e-9
        cursor = shot['last_frame_exclusive']
    assert cursor == 900
    assert len(obj['shots']) == 8
    assert obj['audio']['playback_offset_seconds'] == 0
    assert obj['timing']['beat_phase_verified'] is False
    assert obj['timing']['lyric_alignment_verified'] is False

def read_flac_streaminfo(path: Path) -> dict[str, int]:
    with path.open('rb') as f:
        if f.read(4) != b'fLaC':
            raise ValueError('Not a native FLAC stream.')
        hdr = f.read(4)
        if len(hdr) != 4 or (hdr[0] & 0x7f) != 0 or int.from_bytes(hdr[1:], 'big') != 34:
            raise ValueError('Invalid FLAC STREAMINFO.')
        data = f.read(34)
        if len(data) != 34:
            raise ValueError('Truncated FLAC header.')
    packed = int.from_bytes(data[10:18], 'big')
    return {'sample_rate': packed >> 44, 'channels': ((packed >> 41) & 7)+1,
            'bits_per_sample': ((packed >> 36) & 31)+1, 'samples': packed & ((1 << 36)-1)}

def main() -> None:
    paths = validate_package()
    validate_timeline()
    audio = read_flac_streaminfo(ROOT/'assets/audio/pilot_058-073.flac')
    assert audio == {'sample_rate':48000, 'channels':2, 'bits_per_sample':24, 'samples':720000}
    print(f'PASS: {len(paths)} files; 8 contiguous shots; 900 frames; audio 15.000 s / 48000 Hz / 24-bit / stereo.')
    print('These are handoff checks, NOT animation, remote publication, or artistic acceptance tests.')

if __name__ == '__main__':
    main()
