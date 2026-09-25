ALTER TABLE clip ADD COLUMN music_skip_reason text CHECK (music_skip_reason IN ('speech_too_quiet','track_too_quiet','gain_out_of_range','measure_failed'));
