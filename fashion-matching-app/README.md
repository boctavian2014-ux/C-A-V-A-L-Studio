# Fashion Match — AI Product Matching Mobile App

React Native + TypeScript app pentru identificare multimodală a produselor fashion.

## Features

- 📸 **Camera Scan** — identificare vizuală via CLIP embeddings
- 📊 **Barcode Scan** — scanare EAN/UPC pentru exact match
- ⌨️ **Text/OCR Search** — căutare semantică via Sentence-BERT
- 📡 **NFC/DPP** — citire tag-uri NFC și URL-uri DPP
- 🎯 **Exact Match** — găsește produsul exact
- 🔄 **Variants** — identifică variante (culoare, sezon, colecție)
- 👔 **Similar Products** — recomandări vizuale + stil
- 📊 **Confidence Scores** — scoruri detaliate (exact, variant, visual, confidence)

## Tech Stack

- React Native 0.72 + TypeScript 5
- React Navigation 6
- react-native-vision-camera
- react-native-nfc-manager
- expo-image-picker
- FastAPI backend (separat)

## Setup

```bash
cd fashion-matching-app
npm install
npx pod-install ios  # macOS only
npm start
```

## Backend

Pornește serverul matching engine pe `localhost:8000`:

```bash
cd fashion-matching-engine
pip install -r requirements.txt
uvicorn api.main:app --reload
```

## Build

```bash
# Android
npm run build:android

# iOS
npm run build:ios
```

## Structure

```
fashion-matching-app/
├── App.tsx                 # Entry point
├── src/
│   ├── components/         # UI components
│   │   ├── CameraScanner.tsx
│   │   ├── BarcodeScanner.tsx
│   │   ├── NFCTab.tsx
│   │   ├── ProductCard.tsx
│   │   └── ResultsDisplay.tsx
│   ├── screens/            # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── ScanScreen.tsx
│   │   ├── ResultsScreen.tsx
│   │   └── ProductDetailScreen.tsx
│   ├── services/           # API & NFC services
│   │   ├── api.ts
│   │   └── nfcService.ts
│   ├── hooks/              # Custom hooks
│   │   ├── useCamera.ts
│   │   ├── useBarcodeScanner.ts
│   │   └── useNFC.ts
│   ├── types/              # TypeScript interfaces
│   │   └── index.ts
│   ├── utils/              # Helpers
│   │   └── helpers.ts
│   └── navigation/         # Navigation config
│       └── AppNavigator.tsx
└── assets/
```

## License

MIT
