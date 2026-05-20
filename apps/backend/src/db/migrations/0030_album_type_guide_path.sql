ALTER TABLE album_types ADD COLUMN guide_path TEXT;

UPDATE album_types SET guide_path = '/guide/wc-2026' WHERE key = 'fifa_world_cup_2026';
