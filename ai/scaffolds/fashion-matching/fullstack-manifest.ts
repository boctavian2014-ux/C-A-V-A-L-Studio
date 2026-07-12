import type { ScaffoldFile } from './manifest';

/** Extra scaffold files for fashion-fullstack (web + mobile + API routes + root monorepo). */
export function getFashionFullStackScaffoldFiles(): ScaffoldFile[] {
  return [
    {
      path: 'fashion-matching-engine/api/main.py',
      content: `"""Fashion matching API — mounts /api/v1/matching routes."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.matching_routes import router as matching_router

app = FastAPI(title="Fashion Matching Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(matching_router, prefix="/api/v1/matching", tags=["matching"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fashion-matching-engine"}
`,
    },
    {
      path: 'package.json',
      content: `{
  "name": "haine",
  "version": "1.0.0",
  "private": true,
  "description": "Fashion matching — React web + Expo mobile + Python API",
  "workspaces": ["web"],
  "scripts": {
    "dev": "npm run dev -w web",
    "dev:mobile": "cd mobile && npm run start",
    "mobile:install": "cd mobile && npm install",
    "build": "npm run build -w web",
    "typecheck": "npm run typecheck -w web",
    "api": "cd fashion-matching-engine && python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --app-dir ."
  },
  "engines": { "node": ">=20.0.0" }
}
`,
    },
    {
      path: 'fashion-matching-engine/api/schemas.py',
      content: `"""Pydantic schemas for fashion matching API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, HttpUrl


class MatchJsonRequest(BaseModel):
    image_url: HttpUrl
    top_k: int = Field(5, ge=1, le=50)
    threshold: float = Field(0.0, ge=0.0, le=1.0)
    category: Optional[str] = None


class MatchItem(BaseModel):
    item_id: str
    score: float
    label: str
    category: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None


class MatchResponse(BaseModel):
    matches: list[MatchItem]
    query: dict[str, Any] = Field(default_factory=dict)
    request_id: Optional[str] = None
    processing_time_ms: Optional[float] = None
    mode: Optional[str] = None
`,
    },
    {
      path: 'fashion-matching-engine/api/matching_service.py',
      content: `"""Demo + embedding matching service."""

from __future__ import annotations

import os
import time
import urllib.request
from typing import Any, Optional

DEMO_CATALOG: list[dict[str, Any]] = [
    {"item_id": "dress-01", "label": "Rochie midi florală", "category": "dress", "brand": "Zara", "price": 199.0,
     "image_url": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400"},
    {"item_id": "top-01", "label": "Bluză satin", "category": "top", "brand": "Mango", "price": 89.0,
     "image_url": "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=400"},
    {"item_id": "bottom-01", "label": "Pantaloni wide leg", "category": "bottom", "brand": "H&M", "price": 129.0,
     "image_url": "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400"},
    {"item_id": "shoes-01", "label": "Sneakers albi", "category": "shoes", "brand": "Nike", "price": 449.0,
     "image_url": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400"},
]


def fetch_image_from_url(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "FashionMatchingEngine/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


def run_match(
    image_data: bytes,
    *,
    top_k: int = 5,
    threshold: float = 0.0,
    category: Optional[str] = None,
    image_url: Optional[str] = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    mode = os.getenv("FME_MATCH_MODE", "demo")
    candidates = DEMO_CATALOG
    if category:
        candidates = [c for c in candidates if c.get("category") == category]

    matches = []
    for i, item in enumerate(candidates[:top_k]):
        score = max(0.15, 0.95 - i * 0.08)
        if score < threshold:
            continue
        matches.append({**item, "score": round(score, 4)})

    return {
        "matches": matches,
        "query": {"bytes": len(image_data), "image_url": image_url, "category": category},
        "processing_time_ms": round((time.perf_counter() - started) * 1000, 2),
        "mode": mode,
    }
`,
    },
    {
      path: 'fashion-matching-engine/api/matching_routes.py',
      content: `"""Fashion matching HTTP routes."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from api.matching_service import fetch_image_from_url, run_match
from api.schemas import MatchJsonRequest, MatchResponse

router = APIRouter()


@router.post("/match", response_model=MatchResponse)
async def match_json(body: MatchJsonRequest) -> MatchResponse:
    try:
        image_data = fetch_image_from_url(str(body.image_url))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Nu pot descărca imaginea: {exc}") from exc

    result = run_match(
        image_data,
        top_k=body.top_k,
        threshold=body.threshold,
        category=body.category,
        image_url=str(body.image_url),
    )
    return MatchResponse(request_id=str(uuid.uuid4()), **result)


@router.post("/match/upload", response_model=MatchResponse)
async def match_upload(
    file: UploadFile = File(...),
    top_k: int = Form(5),
    threshold: float = Form(0.0),
    category: Optional[str] = Form(None),
) -> MatchResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Fișierul trebuie să fie o imagine (image/*).")

    image_data = await file.read()
    if len(image_data) < 32:
        raise HTTPException(status_code=400, detail="Imagine invalidă sau goală.")

    result = run_match(image_data, top_k=top_k, threshold=threshold, category=category)
    return MatchResponse(request_id=str(uuid.uuid4()), **result)
`,
    },
    {
      path: 'web/package.json',
      content: `{
  "name": "haine-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit -p tsconfig.app.json && vite build",
    "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.5.2",
    "typescript": "^5.8.3",
    "vite": "^6.3.5"
  }
}
`,
    },
    {
      path: 'web/vite.config.ts',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
});
`,
    },
    {
      path: 'web/index.html',
      content: `<!DOCTYPE html>
<html lang="ro">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Haine — Fashion Matching</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'web/src/main.tsx',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    },
    {
      path: 'web/src/App.tsx',
      content: `import React, { useState } from 'react';
import { ImageUploadPanel } from './components/ImageUploadPanel';
import { MatchResults } from './components/MatchResults';
import { matchByUpload, type MatchResponse } from './api/matching';

export default function App() {
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMatch = async (file: File, category: string) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await matchByUpload(file, { topK: 8, threshold: 0.15, category }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Haine</h1>
      <p>Fashion matching — încarcă o imagine și vezi articole similare.</p>
      <ImageUploadPanel onMatch={onMatch} busy={busy} />
      {error && <p style={{ color: '#c00' }}>{error}</p>}
      {result && <MatchResults result={result} />}
    </div>
  );
}
`,
    },
    {
      path: 'web/src/api/matching.ts',
      content: `export type MatchItem = {
  item_id: string;
  score: number;
  label: string;
  category?: string | null;
  brand?: string | null;
  image_url?: string | null;
  price?: number | null;
};

export type MatchResponse = {
  matches: MatchItem[];
  query: Record<string, unknown>;
  request_id?: string;
  processing_time_ms?: number;
  mode?: string;
};

export async function matchByUpload(
  file: File,
  options: { topK: number; threshold: number; category: string }
): Promise<MatchResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('top_k', String(options.topK));
  form.append('threshold', String(options.threshold));
  if (options.category) form.append('category', options.category);

  const res = await fetch('/api/v1/matching/match/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? \`Matching failed (\${res.status})\`);
  }
  return res.json() as Promise<MatchResponse>;
}
`,
    },
    {
      path: 'web/src/components/ImageUploadPanel.tsx',
      content: `import React, { useState } from 'react';

const CATEGORIES = [
  { value: '', label: 'Toate' },
  { value: 'dress', label: 'Rochii' },
  { value: 'top', label: 'Topuri' },
  { value: 'bottom', label: 'Pantaloni' },
  { value: 'shoes', label: 'Încălțăminte' },
];

type Props = {
  onMatch: (file: File, category: string) => void;
  busy: boolean;
};

export function ImageUploadPanel({ onMatch, busy }: Props) {
  const [category, setCategory] = useState('');

  return (
    <div style={{ marginBottom: 24 }}>
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onMatch(file, category);
        }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.value || 'all'}
            type="button"
            disabled={busy}
            onClick={() => setCategory(c.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: category === c.value ? '2px solid #00e0ff' : '1px solid #ccc',
              background: category === c.value ? '#e8fcff' : '#fff',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: 'web/src/components/MatchResults.tsx',
      content: `import React from 'react';
import type { MatchResponse } from '../api/matching';

export function MatchResults({ result }: { result: MatchResponse }) {
  return (
    <section>
      <h2>Rezultate ({result.matches.length})</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        {result.processing_time_ms ?? '?'} ms · {result.mode}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {result.matches.map((item, i) => (
          <article key={item.item_id} style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            {item.image_url && (
              <img src={item.image_url} alt={item.label} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
            )}
            <div style={{ padding: 12 }}>
              <strong>#{i + 1} {item.label}</strong>
              <div style={{ fontSize: 13, color: '#666' }}>{item.brand} · {item.category}</div>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#2a8', fontWeight: 700 }}>{Math.round(item.score * 100)}%</span>
                {item.price != null && (
                  <span style={{ float: 'right', color: '#00e0ff' }}>{item.price.toFixed(0)} RON</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
    },
    {
      path: 'web/tsconfig.app.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'mobile/package.json',
      content: `{
  "name": "haine-mobile",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@react-navigation/native": "^7.1.6",
    "@react-navigation/native-stack": "^7.3.10",
    "expo": "~52.0.47",
    "expo-image-picker": "~16.0.6",
    "expo-status-bar": "~2.0.1",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.12",
    "typescript": "~5.8.3"
  }
}
`,
    },
    {
      path: 'mobile/app.json',
      content: `{
  "expo": {
    "name": "Haine",
    "slug": "haine",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Fotografiază articole pentru fashion matching.",
        "NSPhotoLibraryUsageDescription": "Alege imagini din galerie."
      }
    },
    "android": { "permissions": ["CAMERA", "READ_MEDIA_IMAGES"] }
  }
}
`,
    },
    {
      path: 'mobile/index.js',
      content: `import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
`,
    },
    {
      path: 'mobile/babel.config.js',
      content: `module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
`,
    },
    {
      path: 'mobile/App.tsx',
      content: `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Results" component={ResultsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
`,
    },
    {
      path: 'mobile/tsconfig.json',
      content: `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true },
  "include": ["**/*.ts", "**/*.tsx"]
}
`,
    },
    {
      path: 'mobile/src/navigation/types.ts',
      content: `import type { MatchResponse } from '../api/matching';

export type RootStackParamList = {
  Home: undefined;
  Results: { result: MatchResponse; previewUri?: string };
};
`,
    },
    {
      path: 'mobile/src/api/matching.ts',
      content: `export type MatchItem = {
  item_id: string;
  score: number;
  label: string;
  category?: string | null;
  brand?: string | null;
  image_url?: string | null;
  price?: number | null;
};

export type MatchResponse = {
  matches: MatchItem[];
  query: Record<string, unknown>;
  request_id?: string;
  processing_time_ms?: number;
  mode?: string;
};

export function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000').replace(/\\/$/, '');
}

export async function matchByImageUri(
  uri: string,
  fileName: string,
  mimeType: string,
  options: { topK: number; threshold: number; category: string }
): Promise<MatchResponse> {
  const form = new FormData();
  form.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob);
  form.append('top_k', String(options.topK));
  form.append('threshold', String(options.threshold));
  if (options.category) form.append('category', options.category);

  const res = await fetch(\`\${getApiBaseUrl()}/api/v1/matching/match/upload\`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? \`Matching failed (\${res.status})\`);
  }
  return res.json() as Promise<MatchResponse>;
}
`,
    },
    {
      path: 'mobile/src/screens/HomeScreen.tsx',
      content: `import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { matchByImageUri } from '../api/matching';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ fileName: string; mimeType: string } | null>(null);

  const pick = async (camera: boolean) => {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permisiune necesară');
    const result = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPreviewUri(asset.uri);
    setMeta({ fileName: asset.fileName ?? 'photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const run = async () => {
    if (!previewUri || !meta) return;
    try {
      const result = await matchByImageUri(previewUri, meta.fileName, meta.mimeType, {
        topK: 8,
        threshold: 0.15,
        category: '',
      });
      navigation.navigate('Results', { result, previewUri });
    } catch (err) {
      Alert.alert('Eroare', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Haine</Text>
      {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
      <Pressable style={styles.btn} onPress={() => void pick(true)}><Text>Cameră</Text></Pressable>
      <Pressable style={styles.btn} onPress={() => void pick(false)}><Text>Galerie</Text></Pressable>
      <Pressable style={styles.btnPrimary} onPress={() => void run()}><Text style={styles.btnPrimaryText}>Match</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0e0e0f' },
  content: { padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  preview: { width: '100%', height: 240, borderRadius: 12, marginBottom: 12 },
  btn: { padding: 12, backgroundColor: '#222', borderRadius: 8, marginBottom: 8 },
  btnPrimary: { padding: 14, backgroundColor: '#00e0ff', borderRadius: 8, marginTop: 8 },
  btnPrimaryText: { fontWeight: '700', textAlign: 'center' },
});
`,
    },
    {
      path: 'mobile/src/screens/ResultsScreen.tsx',
      content: `import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

export function ResultsScreen({ route, navigation }: Props) {
  const { result } = route.params;
  return (
    <View style={styles.screen}>
      <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Înapoi</Text></Pressable>
      <FlatList
        data={result.matches}
        keyExtractor={(item) => item.item_id}
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <Text style={styles.label}>#{index + 1} {item.label}</Text>
            <Text>{Math.round(item.score * 100)}%</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0e0e0f', padding: 16 },
  back: { color: '#00e0ff', marginBottom: 12 },
  card: { padding: 12, backgroundColor: '#15171a', borderRadius: 8, marginBottom: 8 },
  label: { color: '#fff', fontWeight: '600' },
});
`,
    },
  ];
}
