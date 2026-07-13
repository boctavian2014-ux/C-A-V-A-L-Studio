import { describe, expect, it, vi } from 'vitest';

import {
  isInstallableOpenVsxExtension,
  listPopularOpenVsx,
  mapToMarketplaceExtension,
  searchOpenVsx,
  sortExtensionsByRating,
  type OpenVsxExtension,
} from '../../src/main/open-vsx-client';
import type { MarketplaceExtension } from '../../marketplace/api';

describe('open-vsx-client', () => {
  it('maps Open VSX entry to MarketplaceExtension', () => {
    const entry: OpenVsxExtension = {
      namespace: 'esbenp',
      name: 'prettier-vscode',
      displayName: 'Prettier',
      description: 'Format code',
      downloadCount: 1000,
      averageRating: 4.5,
      reviewCount: 10,
      version: '9.0.0',
      files: { download: 'https://open-vsx.org/vsix', icon: 'https://open-vsx.org/icon.png' },
      engines: { vscode: '^1.80.0' },
    };
    const mapped = mapToMarketplaceExtension(entry);
    expect(mapped.id).toBe('esbenp.prettier-vscode');
    expect(mapped.publisher).toBe('esbenp');
    expect(mapped.vscodeCompatible).toBe(true);
    expect(mapped.iconUrl).toBe('https://open-vsx.org/icon.png');
  });

  it('filters extensions without download URL', () => {
    expect(isInstallableOpenVsxExtension({ namespace: 'a', name: 'b' })).toBe(false);
    expect(
      isInstallableOpenVsxExtension({
        namespace: 'a',
        name: 'b',
        files: { download: 'https://x/vsix' },
        engines: { vscode: '^1.80.0' },
      })
    ).toBe(true);
  });

  it('filters incompatible vscode engine', () => {
    expect(
      isInstallableOpenVsxExtension({
        namespace: 'a',
        name: 'b',
        files: { download: 'https://x/vsix' },
        engines: { vscode: '^2.0.0' },
      })
    ).toBe(false);
  });

  it('sortExtensionsByRating orders by rating then downloads', () => {
    const base = (id: string, rating: number, downloads: number): MarketplaceExtension => ({
      id,
      publisher: 'p',
      name: id,
      version: '1.0.0',
      displayName: id,
      description: '',
      categories: [],
      vscodeCompatible: true,
      cavalVerified: false,
      downloads,
      rating,
      ratingCount: 1,
      trendingScore: 0,
      featured: false,
      tags: [],
      createdAt: '',
      updatedAt: '',
    });

    const sorted = sortExtensionsByRating([
      base('low', 3, 100),
      base('high', 5, 10),
      base('mid', 4, 50),
    ]);

    expect(sorted.map((e) => e.id)).toEqual(['high', 'mid', 'low']);
  });

  it('listPopularOpenVsx returns sorted installable extensions', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          extensions: [
            {
              namespace: 'a',
              name: 'one',
              averageRating: 3,
              downloadCount: 10,
              files: { download: 'https://open-vsx.org/a/one/file' },
              engines: { vscode: '^1.80.0' },
            },
            {
              namespace: 'b',
              name: 'two',
              averageRating: 5,
              downloadCount: 5,
              files: { download: 'https://open-vsx.org/b/two/file' },
              engines: { vscode: '^1.80.0' },
            },
          ],
        }),
      });

    const results = await listPopularOpenVsx(10, fetchImpl as typeof fetch);
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('b.two');
    expect(results[1]?.id).toBe('a.one');
  });

  it('searchOpenVsx returns mapped installable extensions', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          extensions: [
            {
              namespace: 'foo',
              name: 'bar',
              displayName: 'Foo Bar',
              description: 'Test',
              files: { download: 'https://open-vsx.org/foo/bar/file' },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          namespace: 'foo',
          name: 'bar',
          version: '1.0.0',
          files: { download: 'https://open-vsx.org/foo/bar/file' },
          engines: { vscode: '^1.80.0' },
        }),
      });

    const results = await searchOpenVsx('foo', 10, fetchImpl as typeof fetch);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('foo.bar');
  });
});
