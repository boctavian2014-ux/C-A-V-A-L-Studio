# app-icon-rounded.png

Source asset: `branding/app-icon.svg`.

Generate the PNG export from the SVG at these sizes:

- 1024x1024 for store/app distribution.
- 512x512 for desktop shell.
- 256x256, 128x128, 64x64, 32x32, 16x16 for platform icons.

Recommended command when an SVG renderer is available:

```bash
sharp branding/app-icon.svg --resize 1024 1024 branding/app-icon-rounded.png
```

This repository keeps the editable vector source as the canonical asset.
