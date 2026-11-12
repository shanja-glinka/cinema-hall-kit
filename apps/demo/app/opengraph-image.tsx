import { ImageResponse } from 'next/og';

export const alt = 'Cinema Hall Kit: cinema hall builder and seat picker demo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Shared English social preview for public demo pages. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '84px',
        background: '#101316',
        color: '#f4f5f6',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', color: '#a8c7fa', fontSize: 30, letterSpacing: 5 }}>
        CINEMA HALL KIT
      </div>
      <div style={{ display: 'flex', marginTop: 28, fontSize: 66, fontWeight: 700 }}>
        Build a better seat experience
      </div>
      <div style={{ display: 'flex', marginTop: 28, color: '#c4c9d0', fontSize: 32 }}>
        Hall layouts · seat selection · seat-view previews
      </div>
    </div>,
    size,
  );
}
