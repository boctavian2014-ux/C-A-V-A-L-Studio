import axios, { AxiosError } from 'axios';
import { ProductMatchRequest, MatchResponse } from '../types';

const API_BASE_URL = __DEV__
  ? 'http://localhost:8000'
  : 'https://api.fashionmatch.ai';

export const matchProduct = async (
  request: ProductMatchRequest
): Promise<MatchResponse> => {
  const formData = new FormData();
  if (request.barcode) formData.append('barcode', request.barcode);
  if (request.ocrText) formData.append('ocr_text', request.ocrText);
  if (request.imageUri) {
    const uri = request.imageUri;
    const filename = uri.split('/').pop() || 'photo.jpg';
    const type = 'image/jpeg';
    formData.append('image', { uri, name: filename, type } as any);
  }
  if (request.nfcUrl) formData.append('nfc_url', request.nfcUrl);
  if (request.latitude !== undefined) formData.append('latitude', String(request.latitude));
  if (request.longitude !== undefined) formData.append('longitude', String(request.longitude));

  const response = await axios.post<MatchResponse>(
    `${API_BASE_URL}/v1/match`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 20000,
    }
  );

  return response.data;
};

export const checkHealth = async (): Promise<boolean> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
};

export const getProductDetails = async (productId: string): Promise<unknown> => {
  const response = await axios.get(`${API_BASE_URL}/v1/products/${productId}`);
  return response.data;
};

export const reportMismatch = async (data: {
  productId: string;
  expectedId: string;
  reason: string;
}): Promise<void> => {
  await axios.post(`${API_BASE_URL}/v1/feedback/mismatch`, data);
};
