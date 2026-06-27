import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNFC } from '../../hooks/useNFC';
import { matchProduct, checkHealth } from '../../services/api';
import { ProductMatchRequest } from '../../types';

interface Props {
  onResult: (result: any) => void;
  onBack: () => void;
}

export const NFCTab: React.FC<Props> = ({ onResult, onBack }) => {
  const { isNFCAvailable, isReading, nfcUrl, startReading, stopReading } = useNFC();
  const [processing, setProcessing] = React.useState(false);

  const handleNFCMatch = async (url: string) => {
    setProcessing(true);
    try {
      const isHealthy = await checkHealth();
      if (!isHealthy) {
        Alert.alert('Server offline', 'Matching engine-ul nu este disponibil.');
        return;
      }
      const response = await matchProduct({ nfcUrl: url });
      onResult(response);
    } catch (e: any) {
      Alert.alert('Eroare', e.message || 'Matching eșuat.');
    } finally {
      setProcessing(false);
    }
  };

  const handleStartReading = async () => {
    const url = await startReading();
    if (url) {
      handleNFCMatch(url);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Înapoi</Text>
        </TouchableOpacity>
        <Text style={styles.title}>NFC / DPP</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {!isNFCAvailable ? (
          <View style={styles.unavailableContainer}>
            <Text style={styles.unavailableIcon}>📡</Text>
            <Text style={styles.unavailableTitle}>NFC indisponibil</Text>
            <Text style={styles.unavailableText}>
              Acest dispozitiv nu suportă NFC sau funcția este dezactivată.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.iconContainer}>
              <Text style={styles.nfcIcon}>📱</Text>
              <Text style={styles.nfcText}>Apropie telefonul de tag-ul NFC al produsului</Text>
            </View>

            {nfcUrl && (
              <View style={styles.urlContainer}>
                <Text style={styles.urlLabel}>URL detectat:</Text>
                <Text style={styles.urlText} numberOfLines={2}>
                  {nfcUrl}
                </Text>
              </View>
            )}

            {(processing || isReading) && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.processingText}>
                  {isReading ? 'Citesc tag NFC...' : 'Procesez DPP...'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.readButton, (processing || isReading) && styles.readButtonDisabled]}
              onPress={handleStartReading}
              disabled={processing || isReading}
            >
              <Text style={styles.readButtonText}>
                {isReading ? 'Citesc...' : 'Citește Tag NFC'}
              </Text>
            </TouchableOpacity>

            {nfcUrl && !processing && (
              <TouchableOpacity
                style={styles.matchButton}
                onPress={() => handleNFCMatch(nfcUrl)}
              >
                <Text style={styles.matchButtonText}>Caută produs după URL</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
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
  title: { color: '#111', fontSize: 17, fontWeight: '700' },
  content: { flex: 1, padding: 24, alignItems: 'center' },
  unavailableContainer: { alignItems: 'center', marginTop: 80 },
  unavailableIcon: { fontSize: 60, marginBottom: 16 },
  unavailableTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8 },
  unavailableText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  iconContainer: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  nfcIcon: { fontSize: 80, marginBottom: 16 },
  nfcText: { fontSize: 16, color: '#555', textAlign: 'center', lineHeight: 22 },
  urlContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  urlLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 4 },
  urlText: { fontSize: 13, color: '#333', fontFamily: 'monospace' },
  processingContainer: { alignItems: 'center', marginVertical: 32 },
  processingText: { marginTop: 12, fontSize: 14, color: '#666', fontWeight: '600' },
  readButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
  },
  readButtonDisabled: { opacity: 0.6 },
  readButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  matchButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
  },
  matchButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
