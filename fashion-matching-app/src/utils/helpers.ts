export const formatConfidence = (score: number): string => {
  return `${(score * 100).toFixed(0)}%`;
};

export const getScoreColor = (score: number): string => {
  if (score >= 0.9) return '#4CAF50';
  if (score >= 0.75) return '#8BC34A';
  if (score >= 0.6) return '#FFC107';
  if (score >= 0.4) return '#FF9800';
  return '#F44336';
};

export const getMatchTypeLabel = (variant: 'exact' | 'variant' | 'similar'): string => {
  switch (variant) {
    case 'exact':
      return 'EXACT MATCH';
    case 'variant':
      return 'VARIANT';
    case 'similar':
      return 'SIMILAR';
  }
};

export const getMatchTypeColor = (variant: 'exact' | 'variant' | 'similar'): string => {
  switch (variant) {
    case 'exact':
      return '#4CAF50';
    case 'variant':
      return '#FF9800';
    case 'similar':
      return '#2196F3';
  }
};

export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};
