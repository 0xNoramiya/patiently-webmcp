import { ImageResponse } from 'next/og';

import { TOOL_COUNT } from '@/lib/webmcp/catalog';

export const alt =
  'Patiently — an outpatient clinic exposed to AI agents as WebMCP tools, where every clinical write waits for a human click';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Rendered by next/og at build time. Uses system font stacks rather than
 * fetching a webfont so the image can never fail to generate because a font CDN
 * was slow — a broken OG image is worse than a plain one.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(160deg, #ecfdf5 0%, #ffffff 45%, #f6f8f7 100%)',
          padding: '72px 80px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: '#0e8265',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              color: 'white',
            }}
          >
            +
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: '#0f172a' }}>Patiently</div>
            <div style={{ fontSize: 20, color: '#475569' }}>An agent-native clinic</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 74,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: '#0f172a',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>A clinic your agent</span>
            <span style={{ color: '#0c6b54' }}>can actually use.</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 27,
              color: '#475569',
              maxWidth: 940,
              lineHeight: 1.4,
            }}
          >
            {`${TOOL_COUNT} WebMCP tools across the queue, the charts and the prescriptions — and every write stops for a human click.`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {['Read — runs freely', 'Draft — never signed', 'Commit — waits for you'].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 21,
                color: '#0c6b54',
                background: '#d1fae5',
                border: '1px solid #a7f3d0',
                borderRadius: 999,
                padding: '10px 22px',
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
