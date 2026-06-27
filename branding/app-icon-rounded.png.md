# app-icon-rounded.png



Canonical raster export: `branding/app-icon-rounded.png` (1024×1024).



Regenerate all icon assets from 3D PNG masters:



```bash

npm run build:icons

```



Outputs:



- `branding/icons/app-icon-{1024,512,256,128,64,32,16}.png`

- `branding/icons/app-icon-ai-{sizes}.png` — AI panel variant

- `branding/app-icon-rounded.png`

- `build-icons/icon.png`, `icon.ico`, `icon.icns` — electron-builder

- `assets/cavalo-icon.png`, `assets/cavalo-icon-ai.png` (+ renderer copies)



**Canonical sources:**



- App icon: `assets/cavalo-neon-horse.png` (neon horse, transparent)

- AI variant: `assets/icons/3d/png_1024/icon_ai.png`



UI components load 256px tier from `assets/icons/3d/png_256/` via `Cavalo3DIcon.tsx`.



Legacy SVG fallbacks (not used by build): `branding/app-icon.svg`, `branding/app-icon-ai.svg`.

