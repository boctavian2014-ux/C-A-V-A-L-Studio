import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Linking, Alert } from 'react-native';
import FastImage from 'react-native-fast-image';
import { Product } from '../types';
import { truncate } from '../utils/helpers';

interface Props {
  route: { params: { product: Product } };
  navigation: any;
}

export const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { product } = route.params;

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: product.brand,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            Share.share({
              message: `Check out ${product.brand} ${product.model} - ${product.color}`,
              url: product.images[0],
            });
          }}
          style={{ marginRight: 16 }}
        >
          <Text style={styles.shareIcon}>📤</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, product]);

  const handleStoreLink = () => {
    if (product.metadata.storeUrl) {
      Linking.openURL(product.metadata.storeUrl as string).catch(() => {
        Alert.alert('Eroare', 'Nu am putut deschide link-ul magazinului.');
      });
    } else {
      Alert.alert('Info', 'Link magazin indisponibil pentru acest produs.');
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <FastImage
        source={{
          uri: product.thumbnail || product.images[0] || 'https://via.placeholder.com/400',
          priority: FastImage.priority.high,
        }}
        style={styles.heroImage}
        resizeMode={FastImage.resizeMode.contain}
      />

      <View style={styles.content}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>{product.brand}</Text>
          {product.price && (
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>
                {product.price.amount} {product.price.currency}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.model}>{product.model}</Text>

        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: '#4CAF5020' }]}>
            <Text style={[styles.tagText, { color: '#4CAF50' }]}>{product.color}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: '#2196F320' }]}>
            <Text style={[styles.tagText, { color: '#2196F3' }]}>{product.season}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: '#FF980020' }]}>
            <Text style={[styles.tagText, { color: '#FF9800' }]}>{product.category}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: '#9C27B020' }]}>
            <Text style={[styles.tagText, { color: '#9C27B0' }]}>{product.gender}</Text>
          </View>
        </View>

        <View style={styles.metaSection}>
          <Text style={styles.metaSectionTitle}>Detalii produs</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Material:</Text>
            <Text style={styles.metaValue}>{product.material || 'N/A'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Culoare:</Text>
            <Text style={styles.metaValue}>{product.color}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Sezon:</Text>
            <Text style={styles.metaValue}>{product.season}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Categorie:</Text>
            <Text style={styles.metaValue}>{product.category}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Gen:</Text>
            <Text style={styles.metaValue}>{product.gender}</Text>
          </View>
          {Object.entries(product.metadata).map(([key, value]) => (
            <View style={styles.metaRow} key={key}>
              <Text style={styles.metaLabel}>{truncate(key, 20)}:</Text>
              <Text style={styles.metaValue}>{truncate(String(value), 40)}</Text>
            </View>
          ))}
        </View>

        {product.images.length > 1 && (
          <View style={styles.gallerySection}>
            <Text style={styles.galleryTitle}>Galerie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.galleryRow}>
                {product.images.map((img, idx) => (
                  <FastImage
                    key={idx}
                    source={{ uri: img, priority: FastImage.priority.normal }}
                    style={styles.galleryImage}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <TouchableOpacity style={styles.actionButton} onPress={handleStoreLink}>
          <Text style={styles.actionText}>Vezi în magazin</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>ID: {product.id}</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  heroImage: { width: '100%', height: 420, backgroundColor: '#f5f5f5' },
  content: { padding: 24, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 26, fontWeight: '900', color: '#111', textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  priceBadge: { backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  priceText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  model: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 6 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tagText: { fontSize: 12, fontWeight: '700' },
  metaSection: { marginTop: 24 },
  metaSectionTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 12 },
  metaRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  metaLabel: { fontSize: 14, fontWeight: '600', color: '#888', width: 110 },
  metaValue: { fontSize: 14, color: '#333', flex: 1 },
  gallerySection: { marginTop: 28 },
  galleryTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 12 },
  galleryRow: { gap: 12 },
  galleryImage: { width: 120, height: 120, borderRadius: 10, backgroundColor: '#f5f5f5' },
  actionButton: { backgroundColor: '#4CAF50', padding: 16, borderRadius: 14, marginTop: 28, alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 24 },
  footerText: { fontSize: 11, color: '#bbb' },
  shareIcon: { fontSize: 20 },
});
