import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'bonus-ticket-hub' });
  });

  app.post('/api/marketing/analyze-screenshots', async (req, res) => {
    try {
      const { images, periodLabel } = req.body as {
        images?: Array<{ mimeType: string; data: string; name?: string }>;
        periodLabel?: string;
      };

      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({
          error: 'Subí al menos una captura de pantalla de Instagram o Meta Business Suite.',
        });
      }

      if (images.length > 8) {
        return res.status(400).json({
          error: 'Podés analizar hasta 8 capturas por lote.',
        });
      }

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'No hay una clave de Gemini configurada en el servidor. Verificá GEMINI_API_KEY en Settings > Secrets.',
        });
      }

      const imageParts = images.map((img) => ({
        inlineData: {
          mimeType: img.mimeType || 'image/png',
          data: img.data,
        },
      }));

      const textPart = {
        text: `Sos analista senior de Marketing Digital de Bonus Ticket (plataforma de beneficios de Tucumán, Argentina).
Analizá estas capturas de pantalla de Meta Business Suite / Instagram Insights${periodLabel ? ` correspondientes al período "${periodLabel}"` : ''}.
Extraé con máxima precisión los números visibles (si alguna métrica no aparece en ninguna captura, devolvé 0). Si hay varias capturas complementarias (ej. Resumen + Interacciones + Visitas), consolidá los valores sin duplicar.
Luego redactá:
1) Un análisis ejecutivo breve y claro en español de Argentina (voseo natural, orientado a Ramiro, líder del equipo) destacando rendimiento, tendencias y puntos fuertes.
2) Tres recomendaciones concretas para la próxima semana de contenido de Bonus Ticket.`,
      };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [...imageParts, textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              alcance: {
                type: Type.NUMBER,
                description: 'Cuentas alcanzadas / Alcance total',
              },
              visualizaciones: {
                type: Type.NUMBER,
                description: 'Visualizaciones o impresiones totales',
              },
              visitasPerfil: {
                type: Type.NUMBER,
                description: 'Visitas al perfil de Instagram / Facebook',
              },
              interacciones: {
                type: Type.NUMBER,
                description: 'Interacciones totales con el contenido',
              },
              clicsEnlace: {
                type: Type.NUMBER,
                description: 'Clics en el enlace / toques en el sitio web',
              },
              nuevosSeguidores: {
                type: Type.NUMBER,
                description: 'Nuevos seguidores netos del período',
              },
              analisisEjecutivo: {
                type: Type.STRING,
                description: 'Resumen ejecutivo claro en español de Argentina (máximo 120 palabras).',
              },
              recomendaciones: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 acciones concretas recomendadas para el equipo de Marketing.',
              },
            },
            required: [
              'alcance',
              'visualizaciones',
              'visitasPerfil',
              'interacciones',
              'clicsEnlace',
              'nuevosSeguidores',
              'analisisEjecutivo',
              'recomendaciones',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({
          error: 'El modelo no devolvió datos legibles. Probá con capturas más nítidas.',
        });
      }

      const parsed = JSON.parse(rawText);
      return res.json({
        alcance: Number(parsed.alcance) || 0,
        visualizaciones: Number(parsed.visualizaciones) || 0,
        visitasPerfil: Number(parsed.visitasPerfil) || 0,
        interacciones: Number(parsed.interacciones) || 0,
        clicsEnlace: Number(parsed.clicsEnlace) || 0,
        nuevosSeguidores: Number(parsed.nuevosSeguidores) || 0,
        analisisEjecutivo: String(parsed.analisisEjecutivo || ''),
        recomendaciones: Array.isArray(parsed.recomendaciones)
          ? parsed.recomendaciones.map((item: unknown) => String(item))
          : [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error en /api/marketing/analyze-screenshots:', message);

      if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
        return res.status(403).json({
          error:
            'La API Key de Gemini no es válida o no tiene permisos. Revisala en Settings > Secrets.',
        });
      }
      if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        return res.status(429).json({
          error:
            'Se alcanzó el límite de cuota de Gemini API. Esperá unos minutos o revisá tu clave en Settings > Secrets.',
        });
      }
      return res.status(500).json({
        error: `No se pudieron analizar las capturas: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bonus Ticket server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
