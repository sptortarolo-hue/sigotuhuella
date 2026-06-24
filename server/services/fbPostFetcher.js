import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';

function extractIdsFromUrl(url) {
  url = url.replace(/\/+$/, '');
  let m = url.match(/\/groups\/(\d+)\/posts\/(\d+)/);
  if (m) return { postId: m[2], groupId: m[1] };
  m = url.match(/\/posts\/(\d+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/videos\/(\d+)/);
  if (m) return { postId: m[1] };
  m = url.match(/story_fbid=(\d+).*?id=(\d+)/);
  if (m) return { postId: m[1], groupId: m[2] };
  m = url.match(/fbid=(\d+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/share\/p\/([^/?]+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/share\/r\/([^/?]+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/share\/v\/([^/?]+)/);
  if (m) return { postId: m[1] };
  const segments = url.split('/');
  const last = segments[segments.length - 1];
  if (/^[\w-]+$/.test(last) && last.length > 5) return { postId: last };
  return null;
}

async function fetchGraphApiData(postId, groupId, token, url) {
  const fields = 'message,full_picture,permalink_url,created_time,from{id,name},comments.limit(20){message,from{name},created_time}';

  const variants = groupId ? [`${groupId}_${postId}`, postId] : [postId];
  let lastErr = null;

  for (const id of variants) {
    const resp = await fetch(
      `${GRAPH_API}/${id}?fields=${encodeURIComponent(fields)}&access_token=${token}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      return {
        fb_post_id: data.id || postId,
        fb_post_url: data.permalink_url || url,
        author_name: data.from?.name || '',
        content: data.message || '',
        image_urls: data.full_picture ? [data.full_picture] : [],
        posted_at: data.created_time || '',
        comments: (data.comments?.data || []).map(c => ({
          id: c.id,
          author_name: c.from?.name || '',
          text: c.message || '',
          posted_at: c.created_time || '',
        })),
      };
    }
    const err = await resp.json();
    lastErr = err.error?.message || JSON.stringify(err);
  }
  throw new Error(`Graph API error: ${lastErr}`);
}

async function getAppToken() {
  const id = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!id || !secret) return null;
  return `${id}|${secret}`;
}

function generateEmbedHtml(url) {
  const encoded = encodeURIComponent(url);
  return `<iframe src="https://www.facebook.com/plugins/post.php?href=${encoded}&show_text=true&width=500&height=458" width="500" height="458" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>`;
}

async function fetchFbPostOG(url) {
  console.log(`fetchFbPostOG: fetching ${url.slice(0, 100)}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });
  console.log(`fetchFbPostOG: HTTP ${resp.status}, final URL: ${resp.url.slice(0, 100)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  console.log(`fetchFbPostOG: HTML length=${html.length}`);
  const ogDescription = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i)?.[1] || '';
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i)?.[1] || '';
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i)?.[1] || '';
  console.log(`fetchFbPostOG: ogDescription=${ogDescription.slice(0, 120)}, ogImage=${!!ogImage}, ogTitle=${ogTitle.slice(0, 80)}`);
  return { content: ogDescription || ogTitle, image_url: ogImage };
}

async function fetchOembedViaGraph(url, token) {
  const resp = await fetch(
    `${GRAPH_API}/oembed_post?url=${encodeURIComponent(url)}&access_token=${token}&fields=author_name,title,description,thumbnail_url,html`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`oEmbed error: ${err.error?.message || JSON.stringify(err)}`);
  }
  return await resp.json();
}

async function fetchFbPostApify(url) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not configured');

  console.log(`fetchFbPostApify: scraping ${url.slice(0, 100)}`);
  const resp = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${token}&waitForFinish=60`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: [{ url }] }),
      signal: AbortSignal.timeout(70000),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Apify HTTP ${resp.status}: ${err.slice(0, 200)}`);
  }

  const items = await resp.json();
  if (!items || items.length === 0) throw new Error('Apify returned empty dataset');

  const item = items[0];
  const text = item.text || item.caption || item.description || '';
  const images = (item.images || []).filter(Boolean).map(i => typeof i === 'string' ? i : i.url || '');
  const author = item.authorName || item.username || item.pageName || '';

  console.log(`fetchFbPostApify: success, content_length=${text.length}, images=${images.length}`);
  if (text) console.log(`fetchFbPostApify: preview=${text.slice(0, 120)}`);

  return { content: text, image_urls: images, author_name: author };
}

export async function fetchFbPost(url) {
  const ids = extractIdsFromUrl(url);
  const fallbackId = ids?.postId || Buffer.from(url).toString('base64').slice(0, 30);
  const embed_html = generateEmbedHtml(url);

  let content = '';
  let image_urls = [];
  let author_name = '';

  try {
    if (!content) {
      const apifyToken = process.env.APIFY_TOKEN;
      if (apifyToken) {
        try {
          const apify = await fetchFbPostApify(url);
          if (apify.content) content = apify.content;
          if (apify.image_urls?.length) image_urls = apify.image_urls;
          if (apify.author_name) author_name = apify.author_name;
        } catch (err) {
          console.error('fetchFbPost: Apify falló:', err.message);
        }
      }
    }

    if (!image_urls.length) {
      try {
        const og = await fetchFbPostOG(url);
        if (!content && og.content) content = og.content;
        if (og.image_url) image_urls = [og.image_url];
        console.log(`fetchFbPost: OG success, content_length=${content.length}, image=${!!og.image_url}`);
      } catch (err) {
        console.error('fetchFbPost: OG falló:', err.message);
      }
    }

    const tokenRes = await pool.query(
      "SELECT value FROM settings WHERE key = 'instagram_access_token'"
    );
    const pageToken = tokenRes.rows[0]?.value;
    for (const t of [pageToken, await getAppToken()].filter(Boolean)) {
      try {
        const data = await fetchOembedViaGraph(url, t);
        if (data.author_name) author_name = data.author_name;
        if (!content && (data.description || data.title)) content = data.description || data.title;
        if (!image_urls.length && data.thumbnail_url) image_urls = [data.thumbnail_url];
        break;
      } catch (err) {
        console.error('fetchFbPost: oEmbed falló:', err.message);
      }
    }

    if (!image_urls.length && pageToken && ids) {
      try {
        const ga = await fetchGraphApiData(ids.postId, ids.groupId, pageToken, url);
        if (ga.content) content = ga.content;
        if (ga.image_urls?.length) image_urls = ga.image_urls;
      } catch (err) {
        console.error('fetchFbPost: Graph API falló:', err.message);
      }
    }
  } catch (err) {
    console.error('fetchFbPost error:', err.message);
  }

  return {
    fb_post_id: fallbackId,
    fb_post_url: url,
    author_name,
    content,
    image_urls,
    embed_html,
    posted_at: '',
    comments: [],
  };
}
