import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import pool from '../db.js';
import { generateVideo, getRandomReunionPhotos, getGlobalStats, getPetImages, getPetInfo, getNewsImage, getNewsData, fetchRandomPetPhotos } from '../lib/videoAssembler.js';
import { generateVideoContent, generateVideoImages } from '../services/aiService.js';
import { getTemplates, resolveTemplate } from '../lib/videoTemplates.js';
import { captureAllScreenshots } from '../services/screenshotService.js';
import { publishReel } from '../services/instagramService.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE promotional_videos SET status = 'failed', error_msg = 'Timeout: generacion excedio 10 minutos' WHERE status = 'generating' AND created_at < NOW() - INTERVAL '10 minutes'"
    );
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

router.get('/templates', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json({ templates: getTemplates() });
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

router.get('/available-pets', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let query = `SELECT p.id, p.name, p.species, p.status, p.breed, p.description,
      (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as cover_image
      FROM pets p`;
    const params = [];
    if (status) {
      query += ` WHERE p.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ pets: result.rows });
  } catch (err) {
    console.error('Available pets error:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

router.get('/available-news', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { type, limit = 100 } = req.query;
    let query = `SELECT id, title, type, image_data, mime_type, content FROM news`;
    const params = [];
    if (type) {
      query += ` WHERE type = $1`;
      params.push(type);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ news: result.rows });
  } catch (err) {
    console.error('Available news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.post('/generate-ai-content', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { topic, style, numScenes, sceneDescriptions } = req.body;
    if (!style) return res.status(400).json({ error: 'style es requerido' });

    const content = await generateVideoContent(topic, style, numScenes || 5, sceneDescriptions || null);
    res.json(content);
  } catch (err) {
    console.error('AI content generation error:', err);
    res.status(500).json({ error: err.message || 'Error generando contenido con IA' });
  }
});

router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  const {
    style = 'emotive',
    duration = 20,
    music = 'emotional',
    includeVoice = true,
    format = 'vertical',
    mode = 'real',
    scenes = [],
    voiceScript = '',
    voice = 'elena',
    voices,
    frame = 'none',
    topic,
    selectedFeatures = [],
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

    let resolvedScenes = [];
    let sceneDescriptions = [];

if (mode === 'ai') {
  const numScenes = Math.max(3, Math.min(10, scenes.length || 5));
  const aiContent = await generateVideoContent(topic, style, numScenes);

  let aiImages = [];
  if (aiContent.imagePrompts && aiContent.imagePrompts.length > 0) {
    aiImages = await generateVideoImages(aiContent.imagePrompts);
  }

  const nullCount = numScenes - aiImages.filter(Boolean).length;
  let webPhotos = [];
  if (nullCount > 0) {
    webPhotos = await fetchRandomPetPhotos(nullCount);
  }

  let webIdx = 0;
  for (let i = 0; i < numScenes; i++) {
    const img = aiImages[i] || webPhotos[webIdx++];
    if (img) {
      resolvedScenes.push({
        type: 'photo',
        imageBase64: img,
        overlayText: aiContent.overlayTexts[i] || '',
      });
    }
  }

  if (resolvedScenes.length === 0) {
    webPhotos = await fetchRandomPetPhotos(numScenes);
    for (let i = 0; i < webPhotos.length; i++) {
      resolvedScenes.push({
        type: 'photo',
        imageBase64: webPhotos[i],
        overlayText: aiContent.overlayTexts[i] || '',
      });
    }
  }

  var finalVoiceScript = aiContent.voiceScript || voiceScript;
    } else if (mode === 'promo' || mode === 'auto') {
      const numScenes = 5;
      const content = await generateVideoContent(topic, style, numScenes, null, mode, selectedFeatures);
      const aiImages = await generateVideoImages(content.imagePrompts || []);
      for (let i = 0; i < numScenes; i++) {
        const img = aiImages[i] || null;
        if (img) {
          resolvedScenes.push({
            type: 'photo',
            imageBase64: img,
            overlayText: content.overlayTexts[i] || '',
          });
        }
      }
      if (resolvedScenes.length < 3) {
        const webPhotos = await fetchRandomPetPhotos(5);
        for (const photo of webPhotos) {
          resolvedScenes.push({ type: 'photo', imageBase64: photo, overlayText: '' });
        }
      }
      var finalVoiceScript = content.voiceScript || voiceScript;
      if (content.style) var finalStyle = content.style;
      if (content.music) var finalMusic = content.music;
    } else {
      for (const scene of scenes) {
        if (scene.source === 'pet' && scene.petId) {
          const images = await getPetImages(scene.petId);
          const petInfo = await getPetInfo(scene.petId);
          if (petInfo) {
            const parts = [petInfo.name, petInfo.species, petInfo.breed, petInfo.status, petInfo.description].filter(Boolean);
            sceneDescriptions.push(parts.join(' - '));
          }
          for (const img of images.slice(0, 5)) {
            resolvedScenes.push({
              type: 'photo',
              imageBase64: img,
              overlayText: scene.overlayText || '',
            });
          }
        } else if (scene.source === 'news' && scene.newsId) {
          const newsData = await getNewsData(scene.newsId);
          if (newsData && newsData.image_data) {
            resolvedScenes.push({
              type: 'photo',
              imageBase64: newsData.image_data,
              overlayText: scene.overlayText || '',
            });
            if (newsData.title || newsData.content) {
              sceneDescriptions.push(`${newsData.title || ''}. ${newsData.content || ''}`);
            }
          }
        } else if (scene.type === 'photo' && scene.imageBase64) {
          resolvedScenes.push(scene);
        }
      }

      if (resolvedScenes.length === 0) {
        const randomPhotos = await getRandomReunionPhotos(6);
        for (const photo of randomPhotos) {
          resolvedScenes.push({
            type: 'photo',
            imageBase64: photo,
            overlayText: '',
          });
        }
      }

      if (includeVoice && !voiceScript.trim() && sceneDescriptions.length > 0) {
        try {
          const aiContent = await generateVideoContent(
            topic || 'Mascotas y noticias de Sigo Tu Huella',
            style,
            resolvedScenes.length,
            sceneDescriptions,
          );
          var finalVoiceScript = aiContent.voiceScript || '';
          if (aiContent.overlayTexts && aiContent.overlayTexts.length > 0) {
            resolvedScenes.forEach((s, i) => {
              if (!s.overlayText && aiContent.overlayTexts[i]) {
                s.overlayText = aiContent.overlayTexts[i];
              }
            });
          }
        } catch (aiErr) {
          console.warn('AI voiceScript generation failed, using empty:', aiErr.message);
          var finalVoiceScript = voiceScript;
        }
      } else {
        var finalVoiceScript = voiceScript;
      }
    }

    if (resolvedScenes.length === 0) {
      return res.status(400).json({ error: 'No hay imágenes para generar el video. Seleccioná al menos una.' });
    }

const usedStyle = finalStyle || style;
const usedMusic = finalMusic || music;
const title = mode === 'ai' || mode === 'promo' || mode === 'auto'
    ? `Video ${mode} ${usedStyle} ${includeVoice ? 'TTS' : `${duration}s`} ${format}`
    : `Video ${usedStyle} ${includeVoice ? 'TTS' : `${duration}s`} ${format}`;
    const insertResult = await pool.query(
      `INSERT INTO promotional_videos (title, video_data, style, duration, music_track, voice_enabled, format, status, created_by)
       VALUES ($1, '', $2, $3, $4, $5, $6, 'generating', $7)
       RETURNING id`,
      [title, usedStyle, duration, usedMusic, includeVoice, format, req.user.id]
    );
    const videoId = insertResult.rows[0].id;

  setImmediate(async () => {
    try {
      const result = await Promise.race([
        generateVideo({
          style: usedStyle,
          duration,
          music: usedMusic,
          includeVoice,
          format,
          voiceScript: finalVoiceScript,
          voice,
          voices: Array.isArray(voices) && voices.length > 0 ? voices : [voice || 'elena'],
          frame,
          scenes: resolvedScenes,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Video generation timeout (8 minutes)')), 480_000)),
      ]);
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

router.post('/generate-from-template', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { templateId, style, music, voices } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId es requerido' });

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

    const templateConfig = await resolveTemplate(templateId, { style, music, voices });
    if (templateConfig.scenes.length < 2) {
      return res.status(400).json({ error: 'No hay suficientes imágenes (screenshots o Pexels) para el template.' });
    }

    const title = `Template ${templateId} ${templateConfig.style}`;
    const insertResult = await pool.query(
      `INSERT INTO promotional_videos (title, video_data, style, duration, music_track, voice_enabled, format, status, created_by)
       VALUES ($1, '', $2, 20, $3, true, 'vertical', 'generating', $4)
       RETURNING id`,
      [title, templateConfig.style, templateConfig.music, req.user.id]
    );
    const videoId = insertResult.rows[0].id;

    setImmediate(async () => {
      try {
        const result = await Promise.race([
          generateVideo({
            style: templateConfig.style,
            duration: 20,
            music: templateConfig.music,
            includeVoice: true,
            format: 'vertical',
            voiceScript: templateConfig.voiceScript,
            voices: templateConfig.voices,
            frame: 'none',
            scenes: templateConfig.scenes,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Video generation timeout (8 minutes)')), 480_000)),
        ]);
        await pool.query(
          `UPDATE promotional_videos SET video_data = $1, thumbnail_data = $2, status = 'ready' WHERE id = $3`,
          [result.filename, result.thumbnail, videoId]
        );
      } catch (err) {
        console.error('Template video generation failed:', err);
        await pool.query(
          `UPDATE promotional_videos SET status = 'failed', error_msg = $1 WHERE id = $2`,
          [err.message || 'Unknown error', videoId]
        );
      }
    });

    res.json({ status: 'generating', videoId, templateId, message: `Generando video desde template '${templateId}'.` });
  } catch (err) {
    console.error('Generate from template error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate from template' });
  }
});

router.get('/reel-config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const keys = ['reel_enabled', 'reel_interval_hours', 'reel_template_index', 'auto_story_enabled', 'auto_reels_enabled'];
    const { rows } = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys]);
    const config = { reel_enabled: 'true', reel_interval_hours: '6', reel_template_index: '0', auto_story_enabled: 'true', auto_reels_enabled: 'false' };
    for (const row of rows) config[row.key] = row.value;
    res.json(config);
  } catch (err) {
    console.error('Get reel config error:', err);
    res.status(500).json({ error: 'Failed to fetch reel config' });
  }
});

router.post('/reel-config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reel_enabled, reel_interval_hours, auto_story_enabled, auto_reels_enabled } = req.body;
    if (reel_enabled !== undefined) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('reel_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [reel_enabled ? 'true' : 'false']
      );
    }
    if (reel_interval_hours !== undefined) {
      const hours = Math.max(1, Math.min(72, parseInt(reel_interval_hours) || 6));
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('reel_interval_hours', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [String(hours)]
      );
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('reel_template_index', '0') ON CONFLICT (key) DO UPDATE SET value = '0'`
      );
    }
    if (auto_story_enabled !== undefined) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('auto_story_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [auto_story_enabled ? 'true' : 'false']
      );
    }
    if (auto_reels_enabled !== undefined) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('auto_reels_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [auto_reels_enabled ? 'true' : 'false']
      );
    }
    res.json({ message: 'Reel config updated. Changes apply on next cycle.' });
  } catch (err) {
    console.error('Update reel config error:', err);
    res.status(500).json({ error: 'Failed to update reel config' });
  }
});

router.post('/screenshots/trigger', requireAuth, requireAdmin, async (req, res) => {
  try {
    const startedAt = new Date().toISOString();
    console.log('[Screenshots] Manual trigger by admin');
    captureAllScreenshots().catch(err => console.error('[Screenshots] Async error:', err));
    res.json({ message: 'Screenshots triggered', startedAt });
  } catch (err) {
    console.error('Trigger screenshots error:', err);
    res.status(500).json({ error: 'Failed to trigger screenshots' });
  }
});

router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ready') as ready,
        COUNT(*) FILTER (WHERE status = 'generating') as generating,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total,
        MAX(created_at) FILTER (WHERE status = 'ready') as last_generated
      FROM promotional_videos
    `);
    const byDay = await pool.query(`
      SELECT DATE(created_at) as day, COUNT(*)::int as count
      FROM promotional_videos
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY day
    `);
    res.json({ ...stats.rows[0], byDay: byDay.rows });
  } catch (err) {
    console.error('Get reel stats error:', err);
    res.status(500).json({ error: 'Failed to fetch reel stats' });
  }
});

router.post('/publish-reel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });
    const result = await pool.query('SELECT video_data, title FROM promotional_videos WHERE id = $1 AND status = \'ready\'', [videoId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found or not ready' });
    const FRONTEND = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    const videoUrl = `${FRONTEND}/generated/videos/${result.rows[0].video_data}`;
    const published = await publishReel(videoUrl, result.rows[0].title);
    console.log(`[Publish-Reel] Published video ${videoId}`);
    res.json({ message: 'Reel published', id: published.id });
  } catch (err) {
    console.error('Publish reel error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/debug-tts', requireAuth, requireAdmin, async (req, res) => {
  const results = { edgeTts: {} };

  try {
    const { listVoices } = await import('@travisvn/edge-tts');
    const voices = await listVoices();
    const esVoices = voices.filter(v => v.Locale?.startsWith('es'));
    results.edgeTts.voicesFound = voices.length;
    results.edgeTts.spanishVoices = esVoices.map(v => ({ name: v.ShortName, locale: v.Locale, gender: v.Gender }));
  } catch (e) {
    results.edgeTts.error = `List voices failed: ${e.message}`;
  }

  try {
    const { synthesizeSpeech } = await import('../services/ttsService.js');
    const buffer = await synthesizeSpeech('Hola, esto es una prueba de audio.', 'es-AR-ElenaNeural', { rate: '+0%', pitch: '+0Hz' });
    results.edgeTts.synthesisOk = true;
    results.edgeTts.bytes = buffer.length;
  } catch (e) {
    results.edgeTts.synthesisOk = false;
    results.edgeTts.synthesisError = e.message;
  }

  res.json(results);
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
