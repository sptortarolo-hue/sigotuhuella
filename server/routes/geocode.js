import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { geocodeAddress } from '../services/geocoding.js';

const router = Router();

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Demasiadas solicitudes de geocoding. Intentá de nuevo en un minuto.' },
});

// POST /api/geocode { address } -> { coordinates: { lat, lng } | null }
// Mismo motor que el bot de WhatsApp (geocodeAddress). Devuelve null cuando no
// se puede ubicar con precisión (nunca un pin inventado).
router.post('/', geocodeLimiter, async (req, res) => {
  try {
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    if (!address || address.length < 3) {
      return res.status(400).json({ error: 'Dirección inválida' });
    }
    const coordinates = await geocodeAddress(address);
    res.json({ coordinates });
  } catch (err) {
    console.error('geocode error:', err);
    res.status(500).json({ error: 'Error al geocodificar' });
  }
});

export default router;
