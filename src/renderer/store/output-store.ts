import { create } from 'zustand';

import { MAX_OUTPUT_CHANNEL_LINES, takeLast } from '../lib/panel-limits';

export interface OutputChannel {
  name: string;
  lines: string[];
}

interface OutputStore {
  channels: OutputChannel[];
  activeChannel: string;
  append: (channel: string, line: string) => void;
  appendBlock: (channel: string, text: string) => void;
  clearChannel: (channel: string) => void;
  setActiveChannel: (name: string) => void;
}

const MAX_OUTPUT_CHAT_CHARS = 12_000;

export function formatOutputForChat(lines: string[], channelName: string): string {
  if (!lines.length) return '';
  const body = lines.join('\n');
  const trimmed =
    body.length > MAX_OUTPUT_CHAT_CHARS
      ? `…(truncat)\n${body.slice(-MAX_OUTPUT_CHAT_CHARS)}`
      : body;
  return [
    `Analizează output-ul din channel **${channelName}** și propune fix-uri:`,
    '',
    '```',
    trimmed,
    '```',
  ].join('\n');
}

function ensureChannel(channels: OutputChannel[], name: string): OutputChannel[] {
  if (channels.some((c) => c.name === name)) return channels;
  return [...channels, { name, lines: [] }];
}

export const useOutputStore = create<OutputStore>((set) => ({
  channels: [{ name: 'CAVAL', lines: [] }],
  activeChannel: 'CAVAL',

  append: (channel, line) => {
    set((state) => {
      const channels = ensureChannel(state.channels, channel);
      return {
        channels: channels.map((c) =>
          c.name === channel
            ? { ...c, lines: takeLast([...c.lines, line], MAX_OUTPUT_CHANNEL_LINES) }
            : c
        ),
      };
    });
  },

  appendBlock: (channel, text) => {
    const incoming = text.split(/\r?\n/);
    set((state) => {
      const channels = ensureChannel(state.channels, channel);
      return {
        channels: channels.map((c) =>
          c.name === channel
            ? { ...c, lines: takeLast([...c.lines, ...incoming], MAX_OUTPUT_CHANNEL_LINES) }
            : c
        ),
      };
    });
  },

  clearChannel: (channel) => {
    set((state) => ({
      channels: state.channels.map((c) =>
        c.name === channel ? { ...c, lines: [] } : c
      ),
    }));
  },

  setActiveChannel: (name) => {
    set((state) => ({
      activeChannel: name,
      channels: ensureChannel(state.channels, name),
    }));
  },
}));
