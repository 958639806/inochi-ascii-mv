from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from check_package import validate_timeline, safe_path, read_flac_streaminfo
from publish_github import require_private, PublishError, TARGET, main

class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.timeline = json.loads((ROOT/'config/pilot.timeline.json').read_text(encoding='utf-8'))

    def test_contiguous_timeline(self):
        validate_timeline(ROOT)

    def test_every_frame_has_one_shot(self):
        for frame in range(900):
            hits = [s for s in self.timeline['shots'] if s['first_frame'] <= frame < s['last_frame_exclusive']]
            self.assertEqual(len(hits), 1)

    def test_900_is_not_an_output_frame(self):
        self.assertFalse(any(s['first_frame'] <= 900 < s['last_frame_exclusive'] for s in self.timeline['shots']))

    def test_preview_keeps_frame_rate(self):
        self.assertEqual(self.timeline['preview']['fps_num'], 60)
        self.assertEqual(self.timeline['video']['fps_num'], 60)

    def test_audio_not_trimmed_twice(self):
        self.assertEqual(self.timeline['audio']['source_start_seconds'], 58)
        self.assertEqual(self.timeline['audio']['playback_offset_seconds'], 0)

    def test_audio_exact_streaminfo(self):
        self.assertEqual(read_flac_streaminfo(ROOT/'assets/audio/pilot_058-073.flac'),
                         {'sample_rate':48000,'channels':2,'bits_per_sample':24,'samples':720000})

    def test_public_repository_rejected(self):
        with self.assertRaises(PublishError):
            require_private({'full_name':TARGET, 'private':False})

    def test_wrong_repository_rejected(self):
        with self.assertRaises(PublishError):
            require_private({'full_name':'someone/other', 'private':True})

    def test_string_true_rejected(self):
        with self.assertRaises(PublishError):
            require_private({'full_name':TARGET, 'private':'true'})

    def test_expected_private_accepted(self):
        require_private({'full_name':TARGET, 'private':True})

    def test_unsafe_paths_rejected(self):
        for s in ['../secret', '/etc/passwd', '.git/config', '.env', 'x/../../secret', 'x\\..\\secret']:
            with self.assertRaises(ValueError):
                safe_path(ROOT, s)

    def test_local_mode_does_not_call_remote(self):
        with patch('sys.argv', ['publish_github.py']), patch('publish_github.run') as remote, \
             patch('publish_github.validate_package', return_value=['README.md']), \
             patch('publish_github.validate_timeline'):
            self.assertEqual(main(), 0)
            remote.assert_not_called()

    def test_no_claimed_model_reviews(self):
        manifest = json.loads((ROOT/'assets/manifest.json').read_text(encoding='utf-8'))
        self.assertTrue(all(v=='NOT_RUN' for v in manifest['external_model_analysis'].values()))

if __name__ == '__main__':
    unittest.main()
