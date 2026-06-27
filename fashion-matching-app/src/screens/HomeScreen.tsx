import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

type RootStackParamList = {
  Home: undefined;
  Scan: { mode?: 'camera' | 'barcode' | 'nfc' | 'text' };
  Results: { result: any };
  ProductDetail: { product: any };
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const features = [
    {
      title: 'Scanare Camera',
      desc: 'Fotografiază haina pentru identificare vizuală AI',
      icon: 'camera-alt',
      color: '#4CAF50',
      screen: 'Scan',
      mode: 'camera' as const,
    },
    {
      title: 'Scanare Barcode',
      desc: 'Scanează codul de bare pentru identificare instantanee',
      icon: 'barcode-reader',
      color: '#2196F3',
      screen: 'Scan',
      mode: 'barcode' as const,
    },
    {
      title: 'Text / OCR',
      desc: 'Introdu textul de pe etichetă sau descriere',
      icon: 'text-fields',
      color: '#FF9800',
      screen: 'Scan',
      mode: 'text' as const,
    },
    {
      title: 'NFC / DPP',
      desc: 'Apropie telefonul de tag-ul NFC al produsului',
      icon: 'nfc',
      color: '#9C27B0',
      screen: 'Scan',
      mode: 'nfc' as const,
    },
  ];

  const handlePress = (screen: string, mode?: string) => {
    navigation.navigate(screen, mode ? { mode } : undefined);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>FASHION</Text>
            <Text style={styles.brandAccent}>MATCH</Text>
            <Text style={styles.tagline}>AI Product Matching Engine</Text>
          </View>
          <View style={styles.logoCircle}>
            <Icon name="checkroom" size={32} color="#4CAF50" />
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>98.5%</Text>
            <Text style={styles.statLabel}>Acuratețe</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}<200ms</Text>
            <Text style={styles.statLabel}>Latency</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>50K+</Text>
            <Text style={styles.statLabel}>Produse</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Selectează modul de scanare</Text>

        <View style={styles.featuresGrid}>
          {features.map((feature, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.featureCard, { borderLeftColor: feature.color }]}
              onPress={() => handlePress(feature.screen, feature.mode)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${feature.color}15` }]}>
                <Icon name={feature.icon as any} size={28} color={feature.color} />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.desc}</Text>
              </View>
              <Icon name="chevron-right" size={20} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.howItWorks}>
          <Text style={styles.sectionTitle}>Cum funcționează</Text>
          <View style={styles.stepContainer}>
            <View style={styles.step}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
              <Text style={styles.stepText}>Scanează produsul (camera, barcode, NFC sau text)</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
              <Text style={styles.stepText}>AI-ul normalizează și extrage atributele fashion</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
              <Text style={styles.stepText}>Găsește exact match, variante și produse similare</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by CLIP + Sentence-BERT + FAISS</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    backgroundColor: '#111',
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  brandAccent: { fontSize: 32, fontWeight: '900', color: '#4CAF50', letterSpacing: 2 },
  tagline: { fontSize: 12, color: '#888', marginTop: 4, letterSpacing: 1 },
  logoCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: -16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#555', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12, letterSpacing: 1.2 },
  featuresGrid: { paddingHorizontal: 16, gap: 10 },
  featureCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, borderLeftWidth: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  iconContainer: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  featureDesc: { fontSize: 12, color: '#777', marginTop: 2, lineHeight: 16 },
  howItWorks: { paddingHorizontal: 16, marginTop: 8 },
  stepContainer: { backgroundColor: '#fff', borderRadius: 14, padding: 20, gap: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center' },
  stepNumberText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 18 },
  footer: { padding: 24, alignItems: 'center' },
  footerText: { fontSize: 11, color: '#aaa', letterSpacing: 0.5 },
});
