import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'WP Instant — WordPress speed optimization and Core Web Vitals platform';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#f8f8f7',
          color: '#171717',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: -180, right: -120, width: 520, height: 520, borderRadius: 999, background: 'rgba(240,62,47,0.14)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: '#171717', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>⚡</div>
          <div style={{ fontSize: 38, fontWeight: 700 }}>WP Instant</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 78, lineHeight: 1, letterSpacing: -4, fontWeight: 700 }}>
            WordPress speed that optimizes itself
          </div>
          <div style={{ fontSize: 34, color: '#71717a' }}>
            Full-page caching · Critical CSS · WebP/AVIF · Core Web Vitals
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ padding: '14px 28px', borderRadius: 14, background: '#f03e2f', color: '#ffffff', fontSize: 28, fontWeight: 600 }}>
            Zero-DNS connection
          </div>
          <div style={{ fontSize: 28, color: '#71717a' }}>wpinstant.dev</div>
        </div>
      </div>
    ),
    size,
  );
}
