import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import pool from '../db.js';
import { generateVideo } from '../lib/videoAssembler.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const GENERATION_COOLDOWN = 30_000;

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

router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  const {
    style = 'emotive',
    duration = 60,
    music = 'emotional',
    includeVoice = true,
    petId,
    customScript,
    overlayText,
    format = 'vertical'
  } = req.body;

  try {
    const generating = await pool.query(
      "SELECT id, created_at FROM promotional_videos WHERE status = 'generating' LIMIT 1"
    );
    if (generating.rows.length > 0) {
      const elapsed = Date.now() - new Date(generating.rows[0].created_at).getTime();
      if (elapsed < 300_000) {
        return res.status(429).json({ error: 'Ya hay un video generándose. Esperá a que termine.' });
      }
      await pool.query(
        "UPDATE promotional_videos SET status = 'failed', error_msg = 'Timeout: generación anterior no completó' WHERE id = $1",
        [generating.rows[0].id]
      );
    }

    const recent = await pool.query(
      "SELECT created_at FROM promotional_videos WHERE created_by = $1 AND created_at > NOW() - INTERVAL '30 seconds' LIMIT 1",
      [req.user.id]
    );
    if (recent.rows.length > 0) {
      return res.status(429).json({ error: 'Esperá 30 segundos entre generaciones.' });
    }

    const title = `Video ${style} ${duration}s ${format}`;
    const insertResult = await pool.query(
      `INSERT INTO promotional_videos (title, video_data, style, duration, music_track, voice_enabled, format, status, created_by)
       VALUES ($1, '', $2, $3, $4, $5, $6, 'generating', $7)
       RETURNING id`,
      [title, style, duration, music, includeVoice, format, req.user.id]
    );
    const videoId = insertResult.rows[0].id;

    setImmediate(async () => {
      try {
        const result = await generateVideo({
          style, duration, music, includeVoice, petId, customScript, overlayText, format
        });
        await pool.query(
          `UPDATE promotional_videos SET video_data = $1, thumbnail_data = $2, status = 'ready' WHERE id = $3`,
          [result.filename, result.thumbnail, videoId]
        );
      } catch (err) {
        console.error('Video generation failed:', err);
        await pool.query(
          `UPDATE promotional_videos SET status = 'failed', error_msg = $1 WHERE id = $2`,
          [err.message || 'Unknown error', videoId]
        );
      }
    });

    res.json({ status: 'generating', videoId, message: 'Video generation started.' });
  } catch (err) {
    console.error('Generate video init error:', err);
    res.status(500).json({ error: 'Failed to start video generation' });
  }
});

router.get('/file/:filename', requireAuth, (req, res) => {
  const { filename } = req.params;
  if (filename.includes('..')) return res.status(400).send('Invalid filename');
  const filePath = path.join('public', 'generated', 'videos', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.sendFile(path.resolve(filePath));
});

router.get('/thumb/:filename', requireAuth, (req, res) => {
  const { filename } = req.params;
  if (filename.includes('..')) return res.status(400).send('Invalid filename');
  const filePath = path.join('public', 'generated', 'videos', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.sendFile(path.resolve(filePath));
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const video = await pool.query('SELECT video_data, thumbnail_data FROM promotional_videos WHERE id = $1', [req.params.id]);
  if (video.rows.length > 0) {
    const { video_data, thumbnail_data } = video.rows[0];
    const videosDir = path.join('public', 'generated', 'videos');
    if (video_data) {
      try { fs.unlinkSync(path.join(videosDir, video_data)); } catch {}
    }
    if (thumbnail_data) {
      try { fs.unlinkSync(path.join(videosDir, thumbnail_data)); } catch {}
    }
  }
  await pool.query('DELETE FROM promotional_videos WHERE id = $1', [req.params.id]);
  res.json({ message: 'Deleted' });
});

export default router;
