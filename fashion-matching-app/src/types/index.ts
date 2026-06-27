export type InputMode = 'camera' | 'barcode' | 'nfc' | 'text' | 'ocr';

export interface ProductMatchRequest {
  barcode?: string;
  ocrText?: string;
  imageUri?: string;
  nfcUrl?: string;
  latitude?: number;
  longitude?: number;
}

export interface Product {
  id: string;
  brand: string;
  model: string;
  color: string;
  season: string;
  category: string;
  gender: string;
  material: string;
  images: string[];
  thumbnail: string;
  metadata: Record<string, unknown>;
  price?: {
    amount: number;
    currency: string;
    store: string;
  };
}

export interface MatchScores {
  exactMatch: number;
  variantMatch: number;
  visualSimilarity: number;
  textSimilarity: number;
  metadataMatch: number;
  confidence: number;
}

export interface MatchResponse {
  product: Product;
  scores: MatchScores;
  variants: Product[];
  similarProducts: Product[];
  processingTimeMs: number;
  timestamp: string;
}

export interface ScanHistoryItem {
  id: string;
  timestamp: string;
  inputMode: InputMode;
  result: MatchResponse;
  imageUri?: string;
}

export interface AppState {
  isLoading: boolean;
  error: string | null;
  lastResult: MatchResponse | null;
  history: ScanHistoryItem[];
  favorites: string[];
  serverOnline: boolean;
}
