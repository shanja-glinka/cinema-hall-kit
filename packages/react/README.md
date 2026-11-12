# @cinema-hall/react

React components for cinema hall construction and seat picking: a to-scale hall constructor, a 2D seat map, a 3D view from the seat (three.js / React Three Fiber) with avatars on occupied seats, smooth transitions with blur, a glass bottom sheet and booking.

## Install

This registry install applies after `@cinema-hall/react` and `@cinema-hall/core` have been published
to npm:

```sh
pnpm add @cinema-hall/react @cinema-hall/core react react-dom three @react-three/fiber motion
```

`react`, `react-dom`, `three`, `@react-three/fiber` and `motion` are peer dependencies (one copy each in your app).

Until publication, use the current checkout as a workspace: from the repository root run
`pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm --filter demo dev`. The demo imports the
workspace packages through their public exports.

## Use

```tsx
'use client';
import { CinemaHallProvider, HallConstructor, SeatPicker, labels } from '@cinema-hall/react';
import '@cinema-hall/react/styles.css';

export function Booking({ config, occupancy }) {
  return (
    <CinemaHallProvider locale="en-US" labels={labels.en}>
      <SeatPicker
        config={config}
        occupancy={occupancy}
        onBook={(keys, ctx) => api.hold(keys, ctx)}
      />
    </CinemaHallProvider>
  );
}

export function Constructor({ config }) {
  return <HallConstructor defaultValue={config} onSave={(cfg, ctx) => api.saveHall(cfg, ctx)} />;
}
```

- Prices are plain numbers (no currency) shown with a neutral sign `¤`; override with `formatPrice` or `labels.picker.priceSign`.
- Styles live in cascade layers (`@layer chk.*`) with zero specificity: your CSS wins without `!important`.
- Customise in steps: theme tokens → data attributes / `classNames` → slots (`Button`, `Chip`, `Card`, `seat`, …) → parts (`SeatPickerRoot`, `HallConstructorCanvas`, …) → headless hooks (`useSeatPicker`, `useHallEditor`).

Full API: [`docs/api.md`](../../docs/api.md). License: 0BSD.
