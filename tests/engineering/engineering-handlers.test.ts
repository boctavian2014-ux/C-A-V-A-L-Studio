import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCartMarkdown, isPathInsideWorkspace, sanitizeFileName } from '../../src/main/engineering-handlers';

describe('engineering-handlers path safety', () => {
  it('sanitizeFileName keeps normal names intact', () => {
    expect(sanitizeFileName('model.scad')).toBe('model.scad');
    expect(sanitizeFileName('componente-v2.md')).toBe('componente-v2.md');
  });

  it('sanitizeFileName neutralizes traversal-only names', () => {
    // '..' and '.' would escape the output dir via path.join(dir, name).
    expect(sanitizeFileName('..')).toBe('fisier');
    expect(sanitizeFileName('.')).toBe('fisier');
    expect(sanitizeFileName('....')).toBe('fisier');
    expect(sanitizeFileName('   ..   ')).toBe('fisier');
  });

  it('sanitizeFileName strips separators so join cannot escape', () => {
    const dir = path.resolve('/workspace/proj/caval-engineering');
    for (const evil of ['../../etc/passwd', '..\\..\\win.ini', 'a/../../b', '..']) {
      const dest = path.join(dir, sanitizeFileName(evil));
      expect(isPathInsideWorkspace(dir, dest)).toBe(true);
    }
  });

  it('isPathInsideWorkspace rejects paths outside the root', () => {
    const root = path.resolve('/workspace/proj');
    expect(isPathInsideWorkspace(root, path.join(root, 'caval-engineering', 'x.scad'))).toBe(true);
    expect(isPathInsideWorkspace(root, path.resolve('/workspace/other/x'))).toBe(false);
    expect(isPathInsideWorkspace(root, path.resolve(root, '..', 'escape'))).toBe(false);
  });
});

describe('buildCartMarkdown (exportCart)', () => {
  const base = { qty: 1, unitPrice: 10, currency: 'RON', substitute: undefined };

  it('links only valid http(s) shop URLs', () => {
    const md = buildCartMarkdown([
      { ...base, name: 'ESP32', shop: 'Optimus', shopUrl: 'https://www.optimusdigital.ro/esp32' },
      { ...base, name: 'Servo', shop: 'DubiousShop', shopUrl: 'javascript:alert(1)' },
      { ...base, name: 'Motor', shop: 'FileShop', shopUrl: 'file:///etc/passwd' },
    ]);
    expect(md).toContain('[Optimus](https://www.optimusdigital.ro/esp32)');
    expect(md).not.toContain('javascript:');
    expect(md).not.toContain('file:///');
    expect(md).toContain('| DubiousShop |');
  });

  it('escapes pipes and newlines so the table cannot be broken', () => {
    const md = buildCartMarkdown([
      { ...base, name: 'A|B\nC', shop: 'S|hop', shopUrl: 'not a url' },
    ]);
    expect(md).toContain('A\\|B C');
    expect(md).toContain('S\\|hop');
  });

  it('encodes parens and spaces in URLs to keep the markdown link intact', () => {
    const md = buildCartMarkdown([
      { ...base, name: 'X', shop: 'Shop', shopUrl: 'https://ex.com/a(1) b' },
    ]);
    expect(md).toContain('(https://ex.com/a%281%29%20b)');
  });

  it('computes the total across parts', () => {
    const md = buildCartMarkdown([
      { ...base, name: 'A', shop: 'S', shopUrl: 'https://a.ro', qty: 2, unitPrice: 5 },
      { ...base, name: 'B', shop: 'S', shopUrl: 'https://b.ro', qty: 1, unitPrice: 7.5 },
    ]);
    expect(md).toContain('**Total estimat: 17.50 RON**');
  });
});
