import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import FastImage from 'react-native-fast-image';
import { Product, MatchScores } from '../types';
import { getScoreColor, formatConfidence, truncate } from '../utils/helpers';

interface Props {
  product: Product;
  scores?: MatchScores;
  onPress: () => void;
  variant?: 'exact' | 'variant' | 'similar';
}

export const ProductCard: React.FC<Props> = ({ product, scores, onPress, variant = 'exact' }) => {
  const borderColor = {
    exact: '#4CAF50',
    variant: '#FF9800',
    similar: '#2196F3',
  }[variant];

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <FastImage
        source={{
          uri: product.thumbnail || product.images[0] || 'https://via.placeholder.com/150',
          priority: FastImage.priority.normal,
        }}
        style={styles.image}
        resizeMode={FastImage.resizeMode.contain}
      />
      <View style={styles.info}>
        <Text style={styles.brand} numberOfLines={1}>
          {truncate(product.brand, 20)}
        </Text>
        <Text style={styles.model} numberOfLines={1}>
          {truncate(product.model, 24)}
        </Text>
        <Text style={styles.meta}>
          {product.color} • {product.season}
        </Text>
        {scores && (
          <View style={styles.scoresRow}>
            <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(scores.exactMatch) }]}>
              <Text style={styles.scoreText}>Exact: {formatConfidence(scores.exactMatch)}</Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(scores.confidence) }]}>
              <Text style={styles.scoreText}>Conf: {formatConfidence(scores.confidence)}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  info: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  model: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginTop: 3,
  },
  meta: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  scoresRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
