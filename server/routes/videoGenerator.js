import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import pool from '../db.js';
import { generateVideo, getRandomReunionPhotos, getGlobalStats, getPetImages, getPetInfo, getNewsImage, getNewsData, fetchRandomPetPhotos } from '../lib/videoAssembler.js';
import { generateVideoContent, generateVideoImages } from '../services/aiService.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "UPDATE promotional_videos SET status = 'failed', error_msg = 'Timeout: generacion excedio 5 minutos' WHERE status = 'generating' AND created_at < NOW() - INTERVAL '5 minutes'"
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
    let query = `SELECT id, title, type, image_data, mime_type FROM news`;
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
    duration = 30,
    music = 'emotional',
    includeVoice = true,
    format = 'vertical',
    mode = 'real',
    scenes = [],
    voiceScript = '',
    voice = 'elena',
    voices,
    frame = 'none',
    stickers = true,
    confetti = false,
    topic,
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

const title = mode === 'ai'
    ? `Video IA ${style} ${includeVoice ? 'TTS' : `${duration}s`} ${format}`
    : `Video ${style} ${includeVoice ? 'TTS' : `${duration}s`} ${format}`;
    const insertResult = await pool.query(
      `INSERT INTO promotional_videos (title, video_data, style, duration, music_track, voice_enabled, format, status, created_by)
       VALUES ($1, '', $2, $3, $4, $5, $6, 'generating', $7)
       RETURNING id`,
      [title, style, duration, music, includeVoice, format, req.user.id]
    );
    const videoId = insertResult.rows[0].id;

  setImmediate(async () => {
    try {
      const result = await Promise.race([
        generateVideo({
          style,
          duration,
          music,
          includeVoice,
          format,
          voiceScript: finalVoiceScript,
          voice,
          voices: Array.isArray(voices) && voices.length > 0 ? voices : [voice || 'elena'],
          frame,
          stickers,
          confetti,
          scenes: resolvedScenes,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Video generation timeout (5 minutes)')), 300_000)),
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

router.get('/debug-tts', requireAuth, requireAdmin, async (req, res) => {
  const hasKey = !!process.env.AZURE_TTS_KEY;
  const hasKey2 = !!process.env.AZURE_TTS_KEY2;
  const hasRegion = !!process.env.AZURE_TTS_REGION;
  const keyPreview = process.env.AZURE_TTS_KEY ? process.env.AZURE_TTS_KEY.slice(0, 8) + '...' : 'MISSING';
  const key2Preview = process.env.AZURE_TTS_KEY2 ? process.env.AZURE_TTS_KEY2.slice(0, 8) + '...' : 'MISSING';
  const region = process.env.AZURE_TTS_REGION || 'MISSING';
  const resourceName = process.env.AZURE_TTS_RESOURCE || 'sigoth';
  const url = `https://${resourceName}.cognitiveservices.azure.com/cognitiveservices/v1`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR"><voice name="es-AR-ElenaNeural">Prueba</voice></speak>`;

  let restResult1 = 'not tested';
  if (hasKey && hasRegion) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        body: ssml,
      });
      const body = response.ok ? `OK (${response.headers.get('content-length') || '?'} bytes)` : `FAIL ${response.status}: ${(await response.text()).slice(0, 200)}`;
      restResult1 = body;
    } catch (e) {
      restResult1 = `ERROR: ${e.message}`;
    }
  }

  let restResult2 = 'not tested';
  if (hasKey2 && hasRegion) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.AZURE_TTS_KEY2,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        body: ssml,
      });
      const body = response.ok ? `OK (${response.headers.get('content-length') || '?'} bytes)` : `FAIL ${response.status}: ${(await response.text()).slice(0, 200)}`;
      restResult2 = body;
    } catch (e) {
      restResult2 = `ERROR: ${e.message}`;
    }
  }

  let sdkResult = 'not tested';
  try {
    const sdk = await import('microsoft-cognitiveservices-speech-sdk');
    sdkResult = `loaded (keys: ${Object.keys(sdk).slice(0, 5).join(',')})`;
  } catch (e) {
    sdkResult = `IMPORT FAILED: ${e.message}`;
  }

  res.json({ hasKey, hasKey2, hasRegion, keyPreview, key2Preview, region, restResult1, restResult2, sdkResult });
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
