import { Router } from 'express';
import { generateText, generateImage, getImagePromptForType } from '../services/aiService.js';

const router = Router();

router.post('/generate-news', async (req, res) => {
  try {
    const { type, topic } = req.body;
    if (!type) return res.status(400).json({ error: 'Falta el campo "type"' });

    const validTypes = ['consejo_cuidado', 'historia_adopcion', 'tips_bienestar', 'dato_curioso'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Válidos: ${validTypes.join(', ')}` });
    }

    const textResult = await generateText(type, topic || '');
    const imagePrompt = getImagePromptForType(type);
    let coverImage = null;
    let coverMimeType = null;

    try {
      const imgResult = await generateImage(type);
      coverImage = imgResult.imageData;
      coverMimeType = imgResult.mimeType;
    } catch (imgErr) {
      console.error('Error generando imagen (no crítico):', imgErr.message);
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#5A5A40"/><text x="400" y="280" font-family="serif" font-size="48" fill="#F5F5F0" text-anchor="middle">Sigo Tu Huella</text><text x="400" y="340" font-family="sans-serif" font-size="24" fill="#D48C70" text-anchor="middle">${type === 'consejo_cuidado' ? '🐾 Consejo de Cuidado' : type === 'historia_adopcion' ? '🐾 Historia de Adopción' : type === 'tips_bienestar' ? '🐾 Tips de Bienestar' : '🐾 Dato Curioso'}</text></svg>`;
      coverImage = Buffer.from(fallbackSvg).toString('base64');
      coverMimeType = 'image/svg+xml';
    }

    res.json({
      title: textResult.title,
      content: textResult.content,
      coverImage,
      coverMimeType,
    });
  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ error: 'Error al generar contenido: ' + err.message });
  }
});

export default router;
