import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { reportPhoneBlacklist, listPhoneBlacklist, reviewPhoneBlacklist } from '../services/blacklistService.js';

const router = Router();

// POST /api/blacklist/report — reportar un teléfono sospechoso (auth)
router.post('/report', requireAuth, async (req, res) => {
  const { phone, context_type, context_id, reason } = req.body;
  if (!phone) return res.status(400).json({ error: 'Se requiere un teléfono' });
  try {
    const result = await reportPhoneBlacklist(phone, req.user.id, { contextType: context_type, contextId: context_id, reason });
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    console.error('report blacklist error:', err);
    res.status(500).json({ error: 'Error al reportar el teléfono' });
  }
});

// GET /api/blacklist — listado (admin). Filtro ?status=pending
router.get('/', requireAdmin, async (req, res) => {
  try {
    const entries = await listPhoneBlacklist(req.query.status || null);
    res.json({ entries });
  } catch (err) {
    console.error('list blacklist error:', err);
    res.status(500).json({ error: 'Error al listar la lista negra' });
  }
});

// POST /api/blacklist/:id/review — aprobar/descartar (admin)
router.post('/:id/review', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Se requiere un estado' });
  try {
    const result = await reviewPhoneBlacklist(req.params.id, status);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('review blacklist error:', err);
    res.status(500).json({ error: 'Error al actualizar la entrada' });
  }
});

export default router;