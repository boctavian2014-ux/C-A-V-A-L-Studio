import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Keyboard } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, Route } from '@react-navigation/native';
import { CameraScanner } from '../components/CameraScanner';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { NFCTab } from '../components/NFCTab';
import { matchProduct, checkHealth } from '../services/api';
import { ProductMatchRequest, MatchResponse } from '../types';

type ScanRoute = Route<{ mode?: 'camera' | 'barcode' | 'nfc' | 'text' }>;
type RootStackParamList = {
  Scan: { mode?: 'camera' | 'barcode' | 'nfc' | 'text' };
  Results: { result: MatchResponse };
};

export const ScanScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ScanRoute>();
  const mode = route.params?.mode || 'camera';
  const [ocrText, setOcrText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResult = async (result: MatchResponse) => {
    navigation.navigate('Results', { result });
  };

  const handleTextSubmit = async () => {
    if (!ocrText.trim()) {
      Alert.alert('Text necesar', 'Introdu brand, model sau cod produs.');
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const isHealthy = await checkHealth();
      if (!isHealthy) {
        Alert.alert('Server offline', 'Matching engine-ul nu este disponibil.');
        return;
      }
      const response = await matchProduct({ ocrText: ocrText.trim() });
      navigation.navigate('Results', { result: response });
    } catch (e: any) {
      Alert.alert('Eroare', e.message || 'Matching eșuat.');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch (mode) {
      case 'barcode':
        return <BarcodeScanner onResult={handleResult} onBack={() => navigation.goBack()} />;
      case 'nfc':
        return <NFCTab onResult={handleResult} onBack={() => navigation.goBack()} />;
      case 'text':
        return (
          <View style={styles.textContainer}>
            <View style={styles.textHeader}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backText}>← Înapoi</Text>
              </TouchableOpacity>
              <Text style={styles.textTitle}>Căutare Text</Text>
              <View style={{ width: 60 }} />
            </View>
            <View style={styles.textContent}>
              <Text style={styles.label}>Brand, model sau cod produs:</Text>
              <TextInput
                style={styles.input}
                placeholder="ex: Nike Air Max 90, SKU: ABC123"
                value={ocrText}
                onChangeText={setOcrText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleTextSubmit}
                placeholderTextColor="#aaa"
              />
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleTextSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Caută produs</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.hint}>Poți introduce text de pe etichetă, factură sau descriere</Text>
            </View>
          </View>
        );
      case 'camera':
      default:
        return <CameraScanner onResult={handleResult} onBack={() => navigation.goBack()} />;
    }
  };

  return <View style={styles.container}>{renderContent()}</View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  textContainer: { flex: 1, backgroundColor: '#fff' },
  textHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  backButton: { padding: 8 },
  backText: { color: '#4CAF50', fontSize: 16, fontWeight: '600' },
  textTitle: { color: '#111', fontSize: 17, fontWeight: '700' },
  textContent: { flex: 1, padding: 24, backgroundColor: '#fff' },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: '#999', marginTop: 12, textAlign: 'center' },
});
