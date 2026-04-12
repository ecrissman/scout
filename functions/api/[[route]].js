// functions/api/[[route]].js
// Cloudflare Pages Function — handles all /api/* routes

// Module-level JWKS cache — persists across requests on the same Worker instance
let cachedJWKS = null;
let jwksCachedAt = 0;

/** ISO week key e.g. `2026-W15` — shared by theme + prompt routes */
function isoWeekKey() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function anthropicHeaders(env) {
  return {
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
}

export async function onRequest({ request, env, params }) {
  const route  = (params.route || []).join('/');
  const method = request.method;

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  // ── Auth: validate Supabase JWT via JWKS (ES256) ─────────────────────────────
  const b64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '='));

  const getUser = async () => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, sig] = parts;

      const headerObj = JSON.parse(b64url(header));

      // Fetch JWKS with module-level cache (1 hour TTL)
      if (!cachedJWKS || Date.now() - jwksCachedAt > 3_600_000) {
        const r = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
        if (!r.ok) return null;
        cachedJWKS = await r.json();
        jwksCachedAt = Date.now();
      }

      const jwk = cachedJWKS.keys?.find(k => k.kid === headerObj.kid);
      if (!jwk) return null;

      const key = await crypto.subtle.importKey(
        'jwk', jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, ['verify']
      );

      const sigBytes = Uint8Array.from(b64url(sig), c => c.charCodeAt(0));
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key, sigBytes,
        new TextEncoder().encode(`${header}.${payload}`)
      );
      if (!valid) return null;

      const claims = JSON.parse(b64url(payload));
      if (claims.exp < Date.now() / 1000) return null;

      return { id: claims.sub, email: claims.email };
    } catch { return null; }
  };

  const b64ToBytes = (dataUrl) => {
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const bufToB64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  // Detect actual image type from magic bytes (handles mis-tagged uploads)
  const detectMediaType = (buffer) => {
    const b = new Uint8Array(buffer, 0, 12);
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return 'image/jpeg';
  };

  // ── POST /api/notify-waitlist — Supabase webhook, no auth required ──────
  if (route === 'notify-waitlist' && method === 'POST') {
    // Verify webhook secret sent as x-webhook-secret header
    if (env.WEBHOOK_SECRET) {
      const secret = request.headers.get('x-webhook-secret') || '';
      if (secret !== env.WEBHOOK_SECRET) return json({ error: 'Forbidden' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const record = body?.record;
    if (!record) return json({ error: 'No record' }, 400);

    const emailBody = [
      `Name: ${record.name}`,
      `Email: ${record.email}`,
      record.note ? `Note: ${record.note}` : null,
      ``,
      `Submitted: ${new Date(record.created_at).toLocaleString()}`,
      ``,
      `Invite them in Supabase → Authentication → Users → Invite user`,
    ].filter(l => l !== null).join('\n');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Scout Waitlist <onboarding@resend.dev>',
        to: ['ecrissman@gmail.com'],
        subject: `New Scout request — ${record.name}`,
        text: emailBody,
      }),
    });

    return json({ ok: true });
  }

  // ── POST /api/waitlist — public, no auth required ───────────────────────
  if (route === 'waitlist' && method === 'POST') {
    const { name, email, note } = await request.json().catch(() => ({}));
    if (!email?.trim()) return json({ error: 'Email is required' }, 400);
    const nameTrim = typeof name === 'string' ? name.trim() : '';
    const noteTrim = typeof note === 'string' ? note.trim() : '';
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        name: nameTrim,
        email: email.trim().toLowerCase(),
        note: noteTrim || null,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (err.code === '23505') return json({ error: 'already_submitted' }, 409);
      return json({ error: 'Failed to submit request' }, 500);
    }
    return json({ ok: true });
  }

  // All routes require auth
  const user = await getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const uid = user.id;

  // ── GET /api/list/[year] ─────────────────────────────────────────────────
  if (/^list\/\d{4}$/.test(route) && method === 'GET') {
    const year = route.split('/')[1];
    const listed = await env.PHOTOS.list({ prefix: `photos/${uid}/${year}-` });
    const dates = [...new Set(
      listed.objects
        .map(o => o.key.match(/photos\/[^/]+\/(\d{4}-\d{2}-\d{2})\//)?.[1])
        .filter(Boolean)
    )].sort();
    return json(dates);
  }

  // ── GET /api/photo/[date] ────────────────────────────────────────────────
  if (/^photo\/\d{4}-\d{2}-\d{2}$/.test(route) && method === 'GET') {
    const date = route.split('/')[1];
    const obj  = await env.PHOTOS.get(`photos/${uid}/${date}/meta.json`);
    if (!obj) return json(null);
    return json(await obj.json());
  }

  // ── POST /api/photo/[date] ───────────────────────────────────────────────
  if (/^photo\/\d{4}-\d{2}-\d{2}$/.test(route) && method === 'POST') {
    const date = route.split('/')[1];
    const { fullSrc, thumbSrc, exif, caption } = await request.json();
    if (!fullSrc || !thumbSrc) return json({ error: 'Missing image data' }, 400);

    const imgType = (src) => {
      if (src.startsWith('data:image/webp')) return 'image/webp';
      if (src.startsWith('data:image/png'))  return 'image/png';
      return 'image/jpeg';
    };
    await Promise.all([
      env.PHOTOS.put(`photos/${uid}/${date}/full.jpg`,  b64ToBytes(fullSrc),  { httpMetadata: { contentType: imgType(fullSrc) } }),
      env.PHOTOS.put(`photos/${uid}/${date}/thumb.jpg`, b64ToBytes(thumbSrc), { httpMetadata: { contentType: imgType(thumbSrc) } }),
      env.PHOTOS.put(`photos/${uid}/${date}/meta.json`, JSON.stringify({ exif: exif || {}, caption: caption || '' }),
        { httpMetadata: { contentType: 'application/json' } }),
    ]);
    return json({ ok: true });
  }

  // ── DELETE /api/photo/[date] ─────────────────────────────────────────────
  if (/^photo\/\d{4}-\d{2}-\d{2}$/.test(route) && method === 'DELETE') {
    const date = route.split('/')[1];
    await Promise.all([
      env.PHOTOS.delete(`photos/${uid}/${date}/full.jpg`),
      env.PHOTOS.delete(`photos/${uid}/${date}/thumb.jpg`),
      env.PHOTOS.delete(`photos/${uid}/${date}/meta.json`),
    ]);
    return json({ ok: true });
  }

  // ── PUT /api/photo/[date]/caption ────────────────────────────────────────
  if (/^photo\/\d{4}-\d{2}-\d{2}\/caption$/.test(route) && method === 'PUT') {
    const date = route.split('/')[1];
    const { caption } = await request.json().catch(() => ({}));
    const obj = await env.PHOTOS.get(`photos/${uid}/${date}/meta.json`);
    if (!obj) return json({ error: 'No photo for this date' }, 404);
    const meta = await obj.json();
    meta.caption = caption ?? meta.caption;
    await env.PHOTOS.put(`photos/${uid}/${date}/meta.json`, JSON.stringify(meta),
      { httpMetadata: { contentType: 'application/json' } });
    return json({ ok: true });
  }

  // ── GET /api/image/[date]/[full|thumb] ───────────────────────────────────
  if (/^image\/\d{4}-\d{2}-\d{2}\/(full|thumb)$/.test(route) && method === 'GET') {
    const parts = route.split('/');
    const date  = parts[1];
    const type  = parts[2];
    const obj   = await env.PHOTOS.get(`photos/${uid}/${date}/${type}.jpg`);
    if (!obj) return new Response(null, { status: 404 });
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  }

  // ── POST /api/ai/feedback/[date] ─────────────────────────────────────────
  if (/^ai\/feedback\/\d{4}-\d{2}-\d{2}$/.test(route) && method === 'POST') {
    const date = route.split('/')[2];
    const obj = await env.PHOTOS.get(`photos/${uid}/${date}/full.jpg`);
    if (!obj) return json({ error: 'No photo for this date' }, 404);

    const imgBuf = await obj.arrayBuffer();
    const b64 = bufToB64(imgBuf);
    const imgMediaType = detectMediaType(imgBuf);

    const prompt = `Give brief, direct feedback on this photo in 2–3 sentences. Note one specific strength (composition, light, moment, or technique), then one concrete suggestion for improvement. Jump straight into the feedback — no title, no preamble. Reference only what's visible in the image.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(env),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.json().catch(() => ({}));
      return json({ error: `Anthropic ${aiRes.status}: ${errBody?.error?.message ?? JSON.stringify(errBody)}` }, 502);
    }
    const aiData = await aiRes.json();
    const feedbackText = aiData.content?.[0]?.text ?? '';

    // Persist feedback into meta.json
    const metaObj = await env.PHOTOS.get(`photos/${uid}/${date}/meta.json`);
    if (metaObj) {
      const meta = await metaObj.json();
      await env.PHOTOS.put(`photos/${uid}/${date}/meta.json`, JSON.stringify({ ...meta, feedback: feedbackText }),
        { httpMetadata: { contentType: 'application/json' } });
    }

    return json({ feedback: feedbackText });
  }

  // ── GET /api/theme/current ───────────────────────────────────────────────
  if (route === 'theme/current' && method === 'GET') {
    const weekKey = isoWeekKey();
    const cached = await env.PHOTOS.get(`themes/${weekKey}.json`);
    if (cached) return json(await cached.json());

    // Generate a new theme for this week
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(env),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{ role: 'user', content: `Generate a weekly photography theme for a daily photo journal app. Respond with JSON only, no markdown.\n{"theme":"2-4 word evocative title","description":"one sentence that inspires creative observation"}\nExamples:\n{"theme":"Borrowed Light","description":"Photograph only light that has traveled through or reflected off something else."}\n{"theme":"Edges & Boundaries","description":"Look for where two things meet — shadows, surfaces, or moments in transition."}` }],
      }),
    });
    if (!aiRes.ok) return json({ theme: 'Open Frame', description: 'No rules today — shoot whatever catches your eye.' });
    const aiData = await aiRes.json();
    let themeData;
    try { themeData = JSON.parse(aiData.content?.[0]?.text ?? '{}'); } catch { themeData = {}; }
    if (!themeData.theme) themeData = { theme: 'Open Frame', description: 'No rules today — shoot whatever catches your eye.' };
    themeData.week = weekKey;
    await env.PHOTOS.put(`themes/${weekKey}.json`, JSON.stringify(themeData), { httpMetadata: { contentType: 'application/json' } });
    return json(themeData);
  }

  // ── GET /api/ai/prompt/[date] ────────────────────────────────────────────
  if (/^ai\/prompt\/\d{4}-\d{2}-\d{2}$/.test(route) && method === 'GET') {
    const wmoDesc = (code) => {
      if (code === 0) return 'clear sky';
      if (code <= 3)  return 'partly cloudy';
      if (code <= 48) return 'foggy';
      if (code <= 55) return 'drizzling';
      if (code <= 65) return 'raining';
      if (code <= 75) return 'snowing';
      if (code <= 82) return 'rain showers';
      return 'stormy';
    };

    // Use coords from client if provided, fall back to Seattle
    const reqUrl = new URL(request.url);
    const lat = parseFloat(reqUrl.searchParams.get('lat')) || 47.6062;
    const lon = parseFloat(reqUrl.searchParams.get('lon')) || -122.3321;

    const localHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false
    }), 10);
    const timeOfDay = localHour < 6 ? 'night' : localHour < 12 ? 'morning' : localHour < 17 ? 'afternoon' : localHour < 20 ? 'evening' : 'night';

    // Last 7 days of captions for this user
    const listed = await env.PHOTOS.list({ prefix: `photos/${uid}/` });
    const dates = [...new Set(
      listed.objects.map(o => o.key.match(/photos\/[^/]+\/(\d{4}-\d{2}-\d{2})\//)?.[1]).filter(Boolean)
    )].sort().slice(-7);
    const captionLines = (await Promise.all(dates.map(async d => {
      const obj = await env.PHOTOS.get(`photos/${uid}/${d}/meta.json`);
      if (!obj) return null;
      const meta = await obj.json();
      return meta.caption ? `${d}: ${meta.caption}` : null;
    }))).filter(Boolean);
    const recentContext = captionLines.length ? captionLines.join('\n') : 'No recent entries.';

    let weatherDesc = 'unknown conditions';
    try {
      const wx = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`
      );
      if (wx.ok) {
        const wxData = await wx.json();
        const temp = Math.round(wxData.current?.temperature_2m ?? 0);
        const code = wxData.current?.weather_code ?? 0;
        weatherDesc = `${wmoDesc(code)}, ${temp}°F`;
      }
    } catch {}

    // Fetch this week's theme
    let themeContext = '';
    try {
      const tObj = await env.PHOTOS.get(`themes/${isoWeekKey()}.json`);
      if (tObj) { const t = await tObj.json(); themeContext = `\nThis week's theme: "${t.theme}" — ${t.description}`; }
    } catch {}

    const prompt = `You are Scout, a charming photography mentor for a daily photo journaler. You're encouraging, direct, and a little campy — like a creative friend who happens to be great at this.\n\nCurrent conditions:\n- Time: ${timeOfDay}\n- Weather: ${weatherDesc}${themeContext}\n\nRecent journal entries (date: caption):\n${recentContext}\n\nWrite one daily photography prompt. Rules:\n- One sentence only. Hard limit: 120 characters.\n- Imperative or present tense ("Find…" / "Shoot…" / "Look for…")\n- Name one concrete subject or situation. No vague words like "something interesting."\n- No subordinate clauses. No commas if you can help it.\n- No technique explanation. Trust the photographer.\n- Must work anywhere — city, suburb, indoors, outdoors.\n- Tone: confident, a little playful. Not a lesson. More like a dare.\n\nGood examples: "Find a long shadow and walk toward it." / "Shoot what you'd normally walk past." / "Chase the shadow, not the light."\n\nRespond with the prompt only. No quotes, no explanation.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(env),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.json().catch(() => ({}));
      return json({ error: `Anthropic ${aiRes.status}: ${errBody?.error?.message ?? JSON.stringify(errBody)}` }, 502);
    }
    const aiData = await aiRes.json();
    return json({ prompt: aiData.content?.[0]?.text ?? '' });
  }

  // ── POST /api/ai/caption/[date] ──────────────────────────────────────────
  if (/^ai\/caption\/\d{4}-\d{2}-\d{2}$/.test(route) && method === 'POST') {
    const date = route.split('/')[2];

    const obj = await env.PHOTOS.get(`photos/${uid}/${date}/full.jpg`);
    if (!obj) return json({ error: 'No photo for this date' }, 404);

    const imgBuf = await obj.arrayBuffer();
    const b64 = bufToB64(imgBuf);
    const imgMediaType = detectMediaType(imgBuf);

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(env),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: b64 } },
            { type: 'text', text: 'Write one short, natural caption for this photo. A single sentence — evocative, specific to what\'s in the image. No hashtags, no generic descriptions.' },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.json().catch(() => ({}));
      return json({ error: `Anthropic ${aiRes.status}: ${errBody?.error?.message ?? JSON.stringify(errBody)}` }, 502);
    }
    const aiData = await aiRes.json();
    return json({ caption: aiData.content?.[0]?.text ?? '' });
  }

  return new Response('Not found', { status: 404 });
}
