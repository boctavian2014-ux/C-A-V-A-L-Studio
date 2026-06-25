import { ipcMain } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// ──────────────────────────────────────────────
//  Image Generator IPC Handlers — Caval IDE
//  Provider: OpenAI DALL-E 3
//  Apeluri directe HTTPS — fără SDK extern
// ──────────────────────────────────────────────

// ── Tipuri ───────────────────────────────────

export interface GenerateImageParams {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  apiKey: string;
}

export interface GenerateImageResult {
  ok: boolean;
  url?: string;          // URL temporar OpenAI (expiră în 1h)
  revisedPrompt?: string; // Promptul revizuit de DALL-E
  error?: string;
}

export interface SaveImageResult {
  ok: boolean;
  savedPath?: string;
  error?: string;
}

// ── Helper: fetch JSON prin HTTPS ─────────────

function httpsPost(url: string, body: object, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const parsed = new URL(url);

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed?.error?.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error('Răspuns invalid de la server.'));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Helper: descarcă imagine binară ──────────

function downloadImage(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // cleanup
      reject(err);
    });
  });
}

// ── Registerare handlere ─────────────────────

export function registerImageHandlers() {

  // ── image:generate ───────────────────────
  // Apelează DALL-E 3 și returnează URL-ul imaginii
  ipcMain.handle(
    'image:generate',
    async (_e, params: GenerateImageParams): Promise<GenerateImageResult> => {
      const { prompt, size = '1024x1024', quality = 'standard', style = 'vivid', apiKey } = params;

      if (!prompt.trim()) {
        return { ok: false, error: 'Promptul este gol.' };
      }
      if (!apiKey?.trim()) {
        return { ok: false, error: 'Lipsește cheia API OpenAI. Adaug-o în câmpul API Key.' };
      }

      try {
        const response = await httpsPost(
          'https://api.openai.com/v1/images/generations',
          {
            model: 'dall-e-3',
            prompt,
            n: 1,
            size,
            quality,
            style,
            response_format: 'url',
          },
          {
            Authorization: `Bearer ${apiKey}`,
          }
        );

        const imageData = response?.data?.[0];
        if (!imageData?.url) {
          return { ok: false, error: 'Niciun URL de imagine în răspuns.' };
        }

        return {
          ok: true,
          url: imageData.url,
          revisedPrompt: imageData.revised_prompt,
        };
      } catch (err: any) {
        return { ok: false, error: err.message || 'Eroare la generare imagine.' };
      }
    }
  );

  // ── image:save ───────────────────────────
  // Descarcă imaginea de la URL și o salvează în proiect
  ipcMain.handle(
    'image:save',
    async (
      _e,
      imageUrl: string,
      projectPath: string,
      fileName: string
    ): Promise<SaveImageResult> => {
      if (!projectPath) {
        return { ok: false, error: 'Niciun proiect deschis. Deschide un folder mai întâi.' };
      }

      try {
        // Salvează în subfolder assets/ din rădăcina proiectului
        const assetsDir = path.join(projectPath, 'assets');
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }

        // Numele fișierului: sanitizat + timestamp
        const timestamp = Date.now();
        const safeName = (fileName || 'caval-image')
          .replace(/[^a-z0-9\-_]/gi, '-')
          .toLowerCase()
          .substring(0, 40);
        const destPath = path.join(assetsDir, `${safeName}-${timestamp}.png`);

        await downloadImage(imageUrl, destPath);

        return { ok: true, savedPath: destPath };
      } catch (err: any) {
        return { ok: false, error: err.message || 'Eroare la salvarea imaginii.' };
      }
    }
  );

  // ── image:saveAs ─────────────────────────
  // Dialog de salvare — utilizatorul alege locația
  ipcMain.handle(
    'image:saveAs',
    async (_e, imageUrl: string): Promise<SaveImageResult> => {
      try {
        const { dialog } = await import('electron');
        const result = await dialog.showSaveDialog({
          title: 'Salvează imaginea',
          defaultPath: `caval-image-${Date.now()}.png`,
          filters: [{ name: 'Images', extensions: ['png'] }],
        });

        if (result.canceled || !result.filePath) {
          return { ok: false, error: 'Anulat.' };
        }

        await downloadImage(imageUrl, result.filePath);
        return { ok: true, savedPath: result.filePath };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }
  );
}
