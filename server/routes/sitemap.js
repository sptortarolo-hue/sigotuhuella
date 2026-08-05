import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const BASE_URL = 'https://sigotuhuella.com.ar';

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/perdidos', priority: '0.9', changefreq: 'daily' },
  { path: '/adopcion', priority: '0.9', changefreq: 'daily' },
  { path: '/novedades', priority: '0.7', changefreq: 'weekly' },
  { path: '/sumate', priority: '0.6', changefreq: 'monthly' },
  { path: '/colaborar', priority: '0.6', changefreq: 'monthly' },
  { path: '/rifas', priority: '0.7', changefreq: 'weekly' },
  { path: '/solicitar-chapita', priority: '0.7', changefreq: 'monthly' },
  { path: '/perdiste-a-tu-mascota', priority: '0.7', changefreq: 'monthly' },
  { path: '/manual', priority: '0.5', changefreq: 'monthly' },
  { path: '/manual/adopcion', priority: '0.5', changefreq: 'monthly' },
  { path: '/manual/chapita', priority: '0.5', changefreq: 'monthly' },
  { path: '/flyer', priority: '0.5', changefreq: 'monthly' },
  { path: '/difusion', priority: '0.5', changefreq: 'monthly' },
];

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const [petsResult, newsResult, rafflesResult] = await Promise.all([
      pool.query(
        `SELECT id, updated_at FROM pets WHERE (is_hidden = FALSE OR is_hidden IS NULL) ORDER BY created_at DESC`
      ),
      pool.query('SELECT id, updated_at FROM news ORDER BY created_at DESC'),
      pool.query('SELECT id, updated_at FROM raffles ORDER BY created_at DESC'),
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    for (const route of STATIC_ROUTES) {
      xml += '<url>';
      xml += '<loc>' + escapeXml(BASE_URL + route.path) + '</loc>';
      xml += '<changefreq>' + route.changefreq + '</changefreq>';
      xml += '<priority>' + route.priority + '</priority>';
      xml += '</url>';
    }

    for (const pet of petsResult.rows) {
      const lastmod = pet.updated_at ? new Date(pet.updated_at).toISOString().split('T')[0] : '';
      xml += '<url>';
      xml += '<loc>' + escapeXml(BASE_URL + '/pet/' + pet.id) + '</loc>';
      if (lastmod) xml += '<lastmod>' + lastmod + '</lastmod>';
      xml += '<changefreq>weekly</changefreq>';
      xml += '<priority>0.8</priority>';
      xml += '</url>';
    }

    for (const news of newsResult.rows) {
      const lastmod = news.updated_at ? new Date(news.updated_at).toISOString().split('T')[0] : '';
      xml += '<url>';
      xml += '<loc>' + escapeXml(BASE_URL + '/novedad/' + news.id) + '</loc>';
      if (lastmod) xml += '<lastmod>' + lastmod + '</lastmod>';
      xml += '<changefreq>monthly</changefreq>';
      xml += '<priority>0.6</priority>';
      xml += '</url>';
    }

    for (const raffle of rafflesResult.rows) {
      const lastmod = raffle.updated_at ? new Date(raffle.updated_at).toISOString().split('T')[0] : '';
      xml += '<url>';
      xml += '<loc>' + escapeXml(BASE_URL + '/rifas/' + raffle.id) + '</loc>';
      if (lastmod) xml += '<lastmod>' + lastmod + '</lastmod>';
      xml += '<changefreq>weekly</changefreq>';
      xml += '<priority>0.6</priority>';
      xml += '</url>';
    }

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Error generating sitemap:', err);
    res.status(500).send('Error generating sitemap');
  }
});

export default router;