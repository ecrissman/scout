import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';

export default function AuthImage({ src, alt, ...props }) {
  const [blobSrc, setBlobSrc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setBlobSrc(null);
    setLoaded(false);
    if (!src) return;
    let url;
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return;
      fetch(src, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.blob() : null)
        .then(blob => { if (blob) { url = URL.createObjectURL(blob); setBlobSrc(url); } });
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src]);
  return <img src={blobSrc || ''} alt={alt} onLoad={() => setLoaded(true)}
    style={{opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease'}} {...props} />;
}
