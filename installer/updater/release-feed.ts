export type ReleaseChannel = "stable" | "beta" | "nightly";

export interface ReleaseFeedEntry {
  version: string;
  channel: ReleaseChannel;
  platform: "win" | "mac" | "linux";
  url: string;
  sha512: string;
  sizeBytes: number;
  deltaUrl?: string;
  releaseDate: string;
  notes: string;
}

export interface ReleaseFeed {
  channel: ReleaseChannel;
  latest: ReleaseFeedEntry;
  history: ReleaseFeedEntry[];
}

export const releaseFeedUrl = (baseUrl: string, channel: ReleaseChannel, platform: string): string =>
  `${baseUrl.replace(/\/$/, "")}/${channel}/${platform}/feed.json`;

export const parseReleaseFeed = (value: unknown): ReleaseFeed => {
  const feed = value as ReleaseFeed;
  if (!feed.channel || !feed.latest) {
    throw new Error("Invalid release feed.");
  }

  return feed;
};
