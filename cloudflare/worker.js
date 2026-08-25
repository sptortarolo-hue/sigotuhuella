const FALLBACK_PAGE = '/custom-5xx.html';

export default {
  async fetch(request, env) {
    let res;
    try {
      res = await fetch(request, { cf: { cacheTtl: -1 } });
    } catch {
      return fallback(request, env);
    }
    if (res.status >= 520 && res.status <= 527) {
      return fallback(request, env);
    }
    return res;
  },
};

async function fallback(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    return Response.json(
      { error: 'service_unavailable', message: 'El servidor no está disponible en este momento. Intentá de nuevo en unos minutos.' },
      { status: 503 }
    );
  }
  try {
    url.pathname = FALLBACK_PAGE;
    url.search = '';
    const page = await env.ASSETS.fetch(url);
    return new Response(page.body, {
      status: 503,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'retry-after': '300',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new Response(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sigo tu huella — problemas técnicos</title></head><body style="margin:0;font-family:sans-serif;background:#F5F5F0;color:#5A5A40;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px"><div><h1 style="font-weight:600">🐾 Estamos teniendo problemas técnicos</h1><p>Intentá de nuevo en unos minutos.</p><p><a href="mailto:info@sigotuhuella.com.ar">info@sigotuhuella.com.ar</a> · <a href="https://www.instagram.com/sigotuhuella.sicardi/">@sigotuhuella.sicardi</a></p></div></body></html>',
      {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '300' },
      }
    );
  }
}
