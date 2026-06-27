import React from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { ProductCard } from './ProductCard';
import { MatchResponse } from '../types';
import { formatConfidence, getMatchTypeLabel, getMatchTypeColor } from '../utils/helpers';

interface Props {
  result: MatchResponse;
  onProductPress: (product: any) => void;
  onRetry?: () => void;
}

export const ResultsDisplay: React.FC<Props> = ({ result, onProductPress, onRetry }) => {
  const sections = [
    {
      title: getMatchTypeLabel('exact'),
      color: getMatchTypeColor('exact'),
      data: [result.product],
      renderItem: ({ item }: { item: any }) => (
        <ProductCard product={item} scores={result.scores} onPress={() => onProductPress(item)} variant="exact" />
      ),
    },
    {
      title: getMatchTypeLabel('variant'),
      color: getMatchTypeColor('variant'),
      data: result.variants,
      renderItem: ({ item }: { item: any }) => (
        <ProductCard product={item} onPress={() => onProductPress(item)} variant="variant" />
      ),
    },
    {
      title: getMatchTypeLabel('similar'),
      color: getMatchTypeColor('similar'),
      data: result.similarProducts,
      renderItem: ({ item }: { item: any }) => (
        <ProductCard product={item} onPress={() => onProductPress(item)} variant="similar" />
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Rezultate Matching</Text>
          <Text style={styles.headerSub}>
            {result.processingTimeMs}ms • {new Date(result.timestamp).toLocaleTimeString('ro-RO')}
          </Text>
        </View>
        <View style={[styles.confidenceBadge, { backgroundColor: getScoreColor(result.scores.confidence) }]}>
          <Text style={styles.confidenceText}>{formatConfidence(result.scores.confidence)}</Text>
        </View>
      </View>

      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>🔍 Scan din nou</Text>
        </TouchableOpacity>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.id || `${item.brand}-${index}`}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { borderLeftColor: section.color }]}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
  headerSub: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  confidenceBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  confidenceText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  retryButton: {
    margin: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
    borderLeftWidth: 4,
    backgroundColor: '#fff',
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#555',
    letterSpacing: 1.2,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  listContent: {
    paddingBottom: 24,
  },
});
