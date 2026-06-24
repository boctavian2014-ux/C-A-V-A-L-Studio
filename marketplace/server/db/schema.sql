CREATE TABLE users (
  id TEXT PRIMARY KEY,
  caval_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  publisher_name TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE extensions (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  vscode_compatible INTEGER NOT NULL DEFAULT 0,
  caval_verified INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  trending_score REAL NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  repository_url TEXT,
  license TEXT,
  icon_url TEXT,
  latest_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (publisher_id) REFERENCES users(id)
);

CREATE TABLE extension_versions (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  engine_vscode TEXT,
  engine_caval TEXT,
  download_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  changelog TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  UNIQUE(extension_id, version)
);

CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(extension_id, user_id)
);

CREATE TABLE downloads (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  user_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  downloaded_at TEXT NOT NULL,
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES extension_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_extensions_name ON extensions(name);
CREATE INDEX idx_extensions_publisher ON extensions(publisher_id);
CREATE INDEX idx_extensions_featured ON extensions(featured);
CREATE INDEX idx_extensions_trending ON extensions(trending_score DESC);
CREATE INDEX idx_extensions_downloads ON extensions(downloads DESC);
CREATE INDEX idx_extensions_rating ON extensions(rating DESC);
CREATE INDEX idx_extension_versions_extension ON extension_versions(extension_id);
CREATE INDEX idx_ratings_extension ON ratings(extension_id);
CREATE INDEX idx_downloads_extension ON downloads(extension_id);
CREATE INDEX idx_categories_slug ON categories(slug);
