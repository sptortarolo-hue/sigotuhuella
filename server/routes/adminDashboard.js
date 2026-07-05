import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

// GET /api/admin/dashboard — full dashboard status + last posts
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const settingsResult = await pool.query('SELECT key, value FROM settings');
    const settings = {};
    settingsResult.rows.forEach(r => { settings[r.key] = r.value; });

    // Last Instagram post
    const lastIg = await pool.query(
      `SELECT ip.id, ip.pet_id, ip.ig_permalink, ip.ig_media_id, ip.caption, ip.status, ip.published_at, ip.created_at,
              p.name as pet_name, p.species as pet_species, p.breed as pet_breed, p.status as pet_status
       FROM instagram_posts ip
       LEFT JOIN pets p ON p.id = ip.pet_id
       WHERE ip.status = 'published' AND ip.ig_media_id IS NOT NULL
       ORDER BY ip.published_at DESC LIMIT 1`
    );

    // Last Facebook page post
    const lastFb = await pool.query(
      `SELECT fpp.id, fpp.pet_id, fpp.page_post_id, fpp.message, fpp.status, fpp.published_at, fpp.created_at,
              p.name as pet_name, p.species as pet_species, p.breed as pet_breed, p.status as pet_status
       FROM facebook_page_posts fpp
       LEFT JOIN pets p ON p.id = fpp.pet_id
       WHERE fpp.status = 'published' AND fpp.page_post_id IS NOT NULL
       ORDER BY fpp.published_at DESC LIMIT 1`
    );

    // Last WhatsApp broadcast (outgoing messages to groups)
    const lastWa = await pool.query(
      `SELECT wm.id, wm.pet_id, wm.text_body, wm.created_at,
              p.name as pet_name, p.species as pet_species, p.breed as pet_breed, p.status as pet_status
       FROM whatsapp_messages wm
       LEFT JOIN pets p ON p.id = wm.pet_id
       WHERE wm.direction = 'outgoing' AND wm.conversation_id IS NULL
       ORDER BY wm.created_at DESC LIMIT 1`
    );

    // Count WhatsApp groups that received last broadcast
    let waGroupsCount = 0;
    if (lastWa.rows.length > 0 && lastWa.rows[0].pet_id) {
      const grpRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM whatsapp_groups WHERE is_active = TRUE AND auto_broadcast = TRUE`
      );
      waGroupsCount = parseInt(grpRes.rows[0].cnt) || 0;
    }

    // Channel statuses
    const channels = {
      fb_scraper: {
        enabled: settings.fb_scraping_enabled === 'true',
        status: settings.fb_scraping_enabled === 'true' ? 'ok' : 'idle',
        lastRun: settings.apify_last_scrape_at || null,
        detail: settings.fb_scraping_enabled === 'true'
          ? `Banda: ${settings.fb_scraper_hour_1 || '8'}:00 - ${settings.fb_scraper_hour_2 || '20'}:00`
          : 'Desactivado',
      },
      fb_publisher: {
        enabled: settings.facebook_page_publisher_enabled === 'true',
        status: settings.facebook_page_publisher_enabled === 'true' ? 'ok' : 'idle',
        lastRun: null,
        detail: settings.facebook_page_publisher_enabled === 'true'
          ? `Intervalo: ${settings.facebook_publisher_interval || '30'} min`
          : 'Desactivado',
      },
      instagram: {
        enabled: settings.instagram_publisher_enabled === 'true',
        status: settings.instagram_publisher_enabled === 'true' ? 'ok' : 'idle',
        lastRun: lastIg.rows[0]?.published_at || null,
        detail: settings.instagram_publisher_enabled === 'true'
          ? `Último post: ${lastIg.rows[0] ? lastIg.rows[0].pet_name : '—'}`
          : 'Desactivado',
      },
      whatsapp_business: {
        enabled: settings.whatsapp_enabled === 'true',
        status: settings.whatsapp_enabled === 'true' ? 'ok' : 'idle',
        lastRun: null,
        detail: settings.whatsapp_enabled === 'true'
          ? `Broadcast: ${settings.whatsapp_broadcast_enabled === 'true' ? 'ON' : 'OFF'}`
          : 'No configurado',
      },
      relay_wa: {
        enabled: settings.relay_enabled !== 'false',
        status: settings.relay_enabled !== 'false' ? 'ok' : 'idle',
        lastRun: settings.relay_last_poll_at || null,
        detail: settings.relay_enabled !== 'false'
          ? `Broadcast adopciones: ${settings.wa_adoption_broadcast_enabled === 'true' ? 'ON' : 'OFF'}`
          : 'Desactivado',
      },
      relay_fb: {
        enabled: settings.fb_relay_enabled === 'true',
        status: settings.fb_relay_enabled === 'true' ? 'ok' : 'idle',
        lastRun: null,
        detail: settings.fb_relay_enabled === 'true'
          ? `Broadcast adopciones: ${settings.fb_adoption_broadcast_enabled === 'true' ? 'ON' : 'OFF'}`
          : 'Desactivado',
      },
    };

    // Last posts per platform
    const lastPost = {
      instagram: lastIg.rows[0] ? {
        pet_id: lastIg.rows[0].pet_id,
        pet_name: lastIg.rows[0].pet_name,
        pet_species: lastIg.rows[0].pet_species,
        pet_breed: lastIg.rows[0].pet_breed,
        pet_status: lastIg.rows[0].pet_status,
        caption: lastIg.rows[0].caption,
        image_url: `/api/images/pet/${lastIg.rows[0].pet_id}/cover`,
        permalink: lastIg.rows[0].ig_permalink,
        published_at: lastIg.rows[0].published_at,
      } : null,
      facebook: lastFb.rows[0] ? {
        pet_id: lastFb.rows[0].pet_id,
        pet_name: lastFb.rows[0].pet_name,
        pet_species: lastFb.rows[0].pet_species,
        pet_breed: lastFb.rows[0].pet_breed,
        pet_status: lastFb.rows[0].pet_status,
        caption: lastFb.rows[0].message,
        image_url: `/api/images/pet/${lastFb.rows[0].pet_id}/cover`,
        page_post_id: lastFb.rows[0].page_post_id,
        published_at: lastFb.rows[0].published_at,
      } : null,
      whatsapp: lastWa.rows[0] ? {
        pet_id: lastWa.rows[0].pet_id,
        pet_name: lastWa.rows[0].pet_name,
        pet_species: lastWa.rows[0].pet_species,
        pet_breed: lastWa.rows[0].pet_breed,
        pet_status: lastWa.rows[0].pet_status,
        caption: lastWa.rows[0].text_body,
        image_url: `/api/images/pet/${lastWa.rows[0].pet_id}/cover`,
        groups_count: waGroupsCount,
        published_at: lastWa.rows[0].created_at,
      } : null,
    };

    // Adoption broadcast config
    const adoptionBroadcast = {
      wa_enabled: settings.wa_adoption_broadcast_enabled === 'true',
      wa_hours: settings.wa_adoption_broadcast_hours || '8,12,16,20',
      fb_enabled: settings.fb_adoption_broadcast_enabled === 'true',
      fb_hours: settings.fb_adoption_broadcast_hours || '8,12,16,20',
    };

    res.json({ channels, lastPost, adoptionBroadcast, settings });
  } catch (err) {
    console.error('Error fetching admin dashboard:', err);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

// POST /api/admin/dashboard/settings — batch update settings
router.post('/settings', requireAdmin, async (req, res) => {
  try {
    const { settings: updates } = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'settings object is required' });
    }

    const entries = Object.entries(updates);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'No settings to update' });
    }

    // Build batch UPSERT
    const keys = [];
    const values = [];
    const placeholders = entries.map(([key, value], i) => {
      keys.push(key);
      values.push(String(value));
      return `($${i * 2 + 1}, $${i * 2 + 2}, NOW())`;
    }).join(', ');

    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ${placeholders}
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      keys.flatMap((k, i) => [k, values[i]])
    );

    res.json({ updated: entries.length, keys });
  } catch (err) {
    console.error('Error batch updating settings:', err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// GET /api/admin/analytics — visit metrics
router.get('/analytics', requireAdmin, async (_req, res) => {
  try {
    const [totalViews, viewsToday, viewsThisWeek, topPets, viewsByDay] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM pet_views'),
      pool.query("SELECT COUNT(*) FROM pet_views WHERE created_at >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM pet_views WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"),
      pool.query(`
        SELECT p.id, p.name, p.species, p.status, p.view_count,
          (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) IS NOT NULL as has_image
        FROM pets p
        WHERE p.view_count > 0
        ORDER BY p.view_count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM pet_views
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),
    ]);

    res.json({
      totalViews: parseInt(totalViews.rows[0].count) || 0,
      viewsToday: parseInt(viewsToday.rows[0].count) || 0,
      viewsThisWeek: parseInt(viewsThisWeek.rows[0].count) || 0,
      topPets: topPets.rows,
      viewsByDay: viewsByDay.rows,
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    res.status(500).json({ error: 'Error al obtener analytics' });
  }
});

export default router;
