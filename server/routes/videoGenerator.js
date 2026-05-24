import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import pool from '../db.js';
import { generateVideo } from '../lib/videoAssembler.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// GET all promotional videos (admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, u.display_name as created_by_name 
      FROM promotional_videos v
      LEFT JOIN users u ON v.created_by = u.id
      ORDER BY v.created_at DESC
    `);
    res.json({ videos: result.rows });
  } catch (err) {
    console.error('Get videos error:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// POST generate new video
router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  const { style = 'emotive', duration = 60, music = 'promo_emotional.mp3', includeVoice = true } = req.body;

  // Check if a generation is already running? For simplicity, kick off async but we could add queue
  setImmediate(async () => {
    try {
      const result = await generateVideo({ style, duration, music, includeVoice });
      // Store video record in DB with filenames only
      await pool.query(
        `INSERT INTO promotional_videos (title, video_data, thumbnail_data, style, duration, music_track, voice_enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`Video ${style} ${duration}s`, result.filename, result.thumbnail, style, duration, music, includeVoice, req.user.id]
      );
    } catch (err) {
      console.error('Video generation failed:', err);
      // Could notify admin via log
    }
  });

  res.json({ status: 'generating', message: 'Video generation started in background' });
});

// GET video file (stream)
router.get('/file/:filename', requireAuth, (req, res) => {
  const { filename } = req.params;
  // Security: ensure filename is safe, no path traversal
  if (filename.includes('..')) {
    return res.status(400).send('Invalid filename');
  }
  const filePath = path.join('public', 'generated', 'videos', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(path.resolve(filePath));
});

// GET thumbnail
router.get('/thumb/:filename', requireAuth, (req, res) => {
  const { filename } = req.params;
  if (filename.includes('..')) {
    return res.status(400).send('Invalid filename');
  }
  const filePath = path.join('public', 'generated', 'videos', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(path.resolve(filePath));
});

// DELETE video
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const video = await pool.query('SELECT video_data, thumbnail_data FROM promotional_videos WHERE id = $1', [req.params.id]);
  if (video.rows.length > 0) {
    const { video_data, thumbnail_data } = video.rows[0];
    // Delete video file
    if (video_data && fs.existsSync(video_data)) {
      try { fs.unlinkSync(video_data); } catch (e) { console.warn('Could not delete video file:', video_data, e.message); }
    }
    // Delete thumbnail file
    if (thumbnail_data && fs.existsSync(thumbnail_data)) {
      try { fs.unlinkSync(thumbnail_data); } catch (e) { console.warn('Could not delete thumbnail file:', thumbnail_data, e.message); }
    }
  }
  await pool.query('DELETE FROM promotional_videos WHERE id = $1', [req.params.id]);
  res.json({ message: 'Deleted' });
});

export default router;
