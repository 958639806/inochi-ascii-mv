#!/usr/bin/env python3
"""Publish the initial handoff to one private repository using the user's gh login.

Only an explicit --publish performs network writes. No tokens are requested or logged;
no global git configuration, public deployment, force push or repo deletion is used.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_package import ROOT, TARGET, validate_package, validate_timeline

OWNER = TARGET.split('/')[0]
URL = f'https://github.com/{TARGET}.git'
COMMITTER = ['-c', 'user.name=Inochi Project Bootstrap', '-c',
             'user.email=inochi-bootstrap@users.noreply.github.com']

class PublishError(RuntimeError):
    pass

def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env.update(GH_HOST='github.com', GH_PROMPT_DISABLED='1', GIT_TERMINAL_PROMPT='0')
    r = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=180)
    if check and r.returncode:
        raise PublishError(f'Command failed: {" ".join(args)}\n{r.stderr.strip() or r.stdout.strip()}')
    return r

def require_private(meta: dict) -> None:
    if meta.get('full_name', '').lower() != TARGET.lower() or meta.get('private') is not True:
        raise PublishError('Refusing upload: target is not the expected PRIVATE repository.')

def metadata() -> dict:
    result = json.loads(run(['gh', 'api', f'repos/{TARGET}']).stdout)
    require_private(result)
    return result

def push() -> None:
    # A per-command credential helper avoids changing the user's global git config.
    run(['git', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential',
         'push', '--set-upstream', 'origin', 'main'])

def verify_remote() -> str:
    metadata()
    local = run(['git', 'rev-parse', 'HEAD']).stdout.strip()
    remote = run(['gh', 'api', f'repos/{TARGET}/git/ref/heads/main', '--jq', '.object.sha']).stdout.strip()
    if local != remote:
        raise PublishError('Remote main does not match local HEAD; publication is not verified.')
    return local

def publish() -> None:
    files = validate_package()
    validate_timeline()
    for tool in ('git', 'gh'):
        if shutil.which(tool) is None:
            raise PublishError(f'Missing {tool}. Install it in this work environment before publication.')
    existing = run(['git', 'rev-parse', '--show-toplevel'], check=False)
    if existing.returncode == 0 or (ROOT/'.git').exists():
        raise PublishError('Bootstrap requires a fresh extraction outside any Git checkout. '
                           'For a retry, inspect any existing remote first; do not force-push.')
    login = run(['gh', 'api', 'user', '--jq', '.login']).stdout.strip()
    if login.lower() != OWNER.lower():
        raise PublishError(f'Active GitHub account is {login!r}, not {OWNER}. No repository was created.')
    found = run(['gh', 'api', f'repos/{TARGET}'], check=False)
    if found.returncode == 0:
        require_private(json.loads(found.stdout))
    elif '404' in found.stderr + found.stdout:
        # This is the ONLY repository creation operation; visibility is explicitly private.
        run(['gh', 'repo', 'create', TARGET, '--private', '--description',
             'Private lyrics-led 1080p60 procedural character-animation MV pilot and handoff'])
    else:
        raise PublishError('Could not verify repository existence. No upload attempted.\n' + found.stderr)
    meta = metadata()
    branches = json.loads(run(['gh', 'api', f'repos/{TARGET}/branches?per_page=1']).stdout)
    if not isinstance(branches, list) or branches:
        raise PublishError('Target already has branches/content. Refusing to overwrite an existing project.')
    run(['git', 'init', '-b', 'main'])
    run(['git', 'add', '--', *files])
    run(['git', *COMMITTER, 'commit', '-m', 'docs: initialize Inochi pilot brief, audio clip and handoff'])
    run(['git', 'remote', 'add', 'origin', URL])
    metadata()  # Re-check privacy immediately before sending any content.
    push()
    first = verify_remote()
    # Record only publication already verified above, then publish that factual record.
    status = ROOT / 'handoff/STATUS.md'
    text = status.read_text(encoding='utf-8')
    old = '| 私有 GitHub 建库与上传 | BLOCKED | 当前会话连接没有新建仓库操作；尚未创建远端 |'
    new = f'| 私有 GitHub 建库与上传 | DONE | private=true；首次远端提交已核验：`{first}`；{TARGET} |'
    if old not in text:
        raise PublishError('Initial files uploaded, but status template was unexpected. Inspect remote before continuing.')
    status.write_text(text.replace(old, new), encoding='utf-8')
    results = ROOT / 'handoff/RESULTS.md'
    with results.open('a', encoding='utf-8') as f:
        f.write(f'\n## Repository bootstrap — verified\n- Repository: {meta["html_url"]}\n'
                f'- Private: true\n- Verified initial commit: `{first}`\n'
                '- Published the handoff snapshot and pilot audio; animation still TODO.\n'
                '- Initial snapshot checksum check passed before upload. Handoff files now evolve normally.\n')
    run(['git', 'add', '--', 'handoff/STATUS.md', 'handoff/RESULTS.md'])
    run(['git', *COMMITTER, 'commit', '-m', 'docs: record verified private repository publication'])
    metadata()
    push()
    final = verify_remote()
    print(json.dumps({'repository':meta['html_url'], 'private':True, 'initial_commit':first,
                      'verified_current_commit':final, 'animation':'NOT_IMPLEMENTED'}, ensure_ascii=False, indent=2))

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true', help='Explicitly authorize creation and upload of this private repository.')
    args = parser.parse_args()
    try:
        if not args.publish:
            paths = validate_package()
            validate_timeline()
            print(f'Local handoff check passed ({len(paths)} files). No remote operation performed.')
            print(f'Target: {TARGET}; private only. Run with --publish in an authenticated gh environment.')
            return 0
        publish()
        return 0
    except (PublishError, OSError, ValueError, AssertionError, subprocess.TimeoutExpired) as exc:
        print(f'NOT COMPLETED: {exc}', file=sys.stderr)
        print('Never solve this by making the repository public or pasting credentials into chat.', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
