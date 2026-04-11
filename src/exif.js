// ── EXIF extraction ────────────────────────────────────────────────────────

export async function extractEXIF(file) {
  try {
    const buf = await file.arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return {};
    let off = 2;
    while (off < Math.min(buf.byteLength - 4, 131072)) {
      if (v.getUint8(off) !== 0xFF) break;
      const mk = v.getUint8(off + 1);
      const len = v.getUint16(off + 2);
      if (mk === 0xDA || mk === 0xD9) break;
      if (mk === 0xE1 && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) {
        const t = off + 10;
        const le = v.getUint16(t) === 0x4949;
        const r = {};
        _readIFD(v, t, t + v.getUint32(t + 4, le), le, r);
        return r;
      }
      off += 2 + len;
    }
  } catch {}
  return {};
}

function _readIFD(v, t, off, le, r) {
  try {
    const n = Math.min(v.getUint16(off, le), 200);
    const szMap = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
    for (let i = 0; i < n; i++) {
      const o = off + 2 + i * 12;
      if (o + 12 > v.byteLength) break;
      const tag  = v.getUint16(o, le);
      const type = v.getUint16(o + 2, le);
      const cnt  = v.getUint32(o + 4, le);
      const sz   = (szMap[Math.min(type, 12)] || 1) * Math.min(cnt, 512);
      const vo   = sz > 4 ? t + v.getUint32(o + 8, le) : o + 8;
      if (tag === 0x8769) { _readIFD(v, t, t + v.getUint32(o + 8, le), le, r); continue; }
      if (tag === 0x8825) { _readGPSIFD(v, t, t + v.getUint32(o + 8, le), le, r); continue; }
      if (vo >= v.byteLength) continue;
      if (tag === 0x010F || tag === 0x0110) {
        let s = '';
        for (let j = 0; j < Math.min(cnt - 1, 64); j++) {
          const c = v.getUint8(vo + j); if (!c) break; s += String.fromCharCode(c);
        }
        if (tag === 0x010F) r.make = s.trim(); else r.model = s.trim();
      } else if (tag === 0x829A && type === 5) {
        const n2 = v.getUint32(vo, le), d = v.getUint32(vo + 4, le); if (d) r.et = n2 / d;
      } else if (tag === 0x829D && type === 5) {
        const n2 = v.getUint32(vo, le), d = v.getUint32(vo + 4, le); if (d) r.fn = n2 / d;
      } else if (tag === 0x8827 && type === 3) {
        r.iso = v.getUint16(vo, le);
      } else if (tag === 0x920A && type === 5) {
        const n2 = v.getUint32(vo, le), d = v.getUint32(vo + 4, le); if (d) r.fl = n2 / d;
      } else if (tag === 0x0112 && type === 3) {
        r.orientation = v.getUint16(vo, le);
      }
    }
  } catch {}
}

function _readGPSIFD(v, t, off, le, r) {
  try {
    const n = Math.min(v.getUint16(off, le), 64);
    const gps = {};
    for (let i = 0; i < n; i++) {
      const o = off + 2 + i * 12;
      if (o + 12 > v.byteLength) break;
      const tag  = v.getUint16(o, le);
      const type = v.getUint16(o + 2, le);
      const cnt  = v.getUint32(o + 4, le);
      const szMap = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
      const sz = (szMap[Math.min(type, 12)] || 1) * Math.min(cnt, 32);
      const vo = sz > 4 ? t + v.getUint32(o + 8, le) : o + 8;
      if (vo >= v.byteLength) continue;
      // Refs (ASCII single char)
      if ((tag === 0x0001 || tag === 0x0003) && type === 2) {
        gps[tag] = String.fromCharCode(v.getUint8(vo));
      }
      // Lat/Lon (3 rationals: deg, min, sec)
      if ((tag === 0x0002 || tag === 0x0004) && type === 5 && cnt === 3) {
        const rat = (idx) => {
          const base = vo + idx * 8;
          const num = v.getUint32(base, le), den = v.getUint32(base + 4, le);
          return den ? num / den : 0;
        };
        gps[tag] = rat(0) + rat(1) / 60 + rat(2) / 3600;
      }
    }
    if (gps[0x0002] != null && gps[0x0004] != null) {
      r.lat = gps[0x0001] === 'S' ? -gps[0x0002] : gps[0x0002];
      r.lon = gps[0x0003] === 'W' ? -gps[0x0004] : gps[0x0004];
    }
  } catch {}
}

export function formatExif(exif) {
  if (!exif) return { strip: null, camera: null };
  const p = [];
  if (exif.fn > 0) p.push(`f/${parseFloat(exif.fn).toFixed(1)}`);
  if (exif.et > 0) p.push(exif.et >= 1 ? `${exif.et.toFixed(1)}s` : `1/${Math.round(1 / exif.et)}s`);
  if (exif.iso > 0) p.push(`ISO\u202F${exif.iso}`);
  if (exif.fl > 0) p.push(`${Math.round(exif.fl)}mm`);
  let camera = null;
  if (exif.model) {
    const mk = (exif.make || '').trim();
    const mo = exif.model.trim();
    camera = mo.toLowerCase().startsWith(mk.split(/\s+/)[0].toLowerCase()) ? mo : `${mk} ${mo}`.trim();
  }
  return { strip: p.length ? p.join(' · ') : null, camera };
}

// ── Image compression ──────────────────────────────────────────────────────

export async function compressFile(file, orientation) {
  const img = await _loadImg(URL.createObjectURL(file), true);
  return _drawCanvas(img, 1200, 0.78, orientation);
}

export async function makeThumb(src) {
  const img = await _loadImg(src, false);
  return _drawCanvas(img, 180, 0.65);
}

function _loadImg(src, revoke) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { if (revoke) URL.revokeObjectURL(src); res(img); };
    img.onerror = rej;
    img.src = src;
  });
}

function _drawCanvas(img, maxPx, quality, orientation = 1) {
  let sw = img.naturalWidth, sh = img.naturalHeight;
  const rotated = orientation >= 5; // 5,6,7,8 swap width/height
  let dw = rotated ? sh : sw, dh = rotated ? sw : sh;
  const scale = Math.min(1, maxPx / Math.max(dw, dh));
  dw = Math.round(dw * scale); dh = Math.round(dh * scale);

  const c = document.createElement('canvas');
  c.width = dw; c.height = dh;
  const ctx = c.getContext('2d');

  // Apply EXIF orientation transform
  ctx.save();
  if (orientation === 2) { ctx.translate(dw,0); ctx.scale(-1,1); }
  else if (orientation === 3) { ctx.translate(dw,dh); ctx.rotate(Math.PI); }
  else if (orientation === 4) { ctx.translate(0,dh); ctx.scale(1,-1); }
  else if (orientation === 5) { ctx.rotate(Math.PI/2); ctx.scale(1,-1); }
  else if (orientation === 6) { ctx.translate(dw,0); ctx.rotate(Math.PI/2); }
  else if (orientation === 7) { ctx.translate(dw,dh); ctx.rotate(Math.PI/2); ctx.scale(1,-1); }
  else if (orientation === 8) { ctx.translate(0,dh); ctx.rotate(-Math.PI/2); }

  if (rotated) ctx.drawImage(img, 0, 0, Math.round(sw * scale), Math.round(sh * scale));
  else ctx.drawImage(img, 0, 0, dw, dh);
  ctx.restore();

  return c.toDataURL('image/webp', quality);
}
