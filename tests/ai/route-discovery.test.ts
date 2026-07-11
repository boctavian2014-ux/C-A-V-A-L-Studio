import { describe, expect, it } from 'vitest';
import { discoverRoutes } from '../../ai/tools/route-discovery';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('route-discovery', () => {
  it('discovers Next.js app routes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-routes-'));
    fs.mkdirSync(path.join(root, 'src', 'app', 'about'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'app', 'page.tsx'),
      'export default function Home() { return <a href="/about">About</a>; }'
    );
    fs.writeFileSync(
      path.join(root, 'src', 'app', 'about', 'page.tsx'),
      'export default function About() { return <button>Click</button>; }'
    );
    const routes = discoverRoutes(root);
    expect(routes.some((r) => r.path === '/')).toBe(true);
    expect(routes.some((r) => r.path === '/about')).toBe(true);
    const about = routes.find((r) => r.path === '/about');
    expect(about?.interactiveElements.some((e) => e.kind === 'button')).toBe(true);
  });

  it('discovers spa link hrefs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-spa-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'App.tsx'),
      'export default () => <nav><a href="/settings">Settings</a></nav>'
    );
    const routes = discoverRoutes(root, ['src/App.tsx']);
    expect(routes.some((r) => r.path === '/settings')).toBe(true);
  });
});
