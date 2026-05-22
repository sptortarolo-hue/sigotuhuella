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
