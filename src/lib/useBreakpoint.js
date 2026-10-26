import { useEffect, useState } from 'react';

// 'mobile' (<1024) | 'medium' (1024–1359) | 'wide' (≥1360)
const get = () => (window.matchMedia('(min-width: 1360px)').matches ? 'wide' : window.matchMedia('(min-width: 1024px)').matches ? 'medium' : 'mobile');
export default function useBreakpoint() {
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const qs = ['(min-width: 1360px)', '(min-width: 1024px)'].map((q) => window.matchMedia(q));
    const on = () => setBp(get());
    qs.forEach((q) => q.addEventListener('change', on));
    return () => qs.forEach((q) => q.removeEventListener('change', on));
  }, []);
  return bp;
}
