import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { initNFC, readNFC, cleanNFC } from '../services/nfcService';

interface UseNFCReturn {
  isNFCAvailable: boolean;
  isReading: boolean;
  nfcUrl: string | null;
  startReading: () => Promise<void>;
  stopReading: () => Promise<void>;
}

export const useNFC = (): UseNFCReturn => {
  const [isNFCAvailable, setIsNFCAvailable] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [nfcUrl, setNfcUrl] = useState<string | null>(null);

  useEffect(() => {
    const checkNFC = async () => {
      const available = await initNFC();
      setIsNFCAvailable(available);
    };
    checkNFC();
    return () => {
      cleanNFC();
    };
  }, []);

  const startReading = useCallback(async () => {
    if (!isNFCAvailable) {
      Alert.alert('NFC indisponibil', 'Acest dispozitiv nu suportă NFC.');
      return;
    }
    setIsReading(true);
    try {
      const url = await readNFC();
      if (url) {
        setNfcUrl(url);
        Alert.alert('NFC citit', `URL: ${url}`);
      } else {
        Alert.alert('NFC', 'Nu s-a detectat niciun tag.');
      }
    } catch (e) {
      Alert.alert('Eroare NFC', 'Nu am putut citi tag-ul NFC.');
    } finally {
      setIsReading(false);
    }
  }, [isNFCAvailable]);

  const stopReading = useCallback(async () => {
    await cleanNFC();
    setIsReading(false);
  }, []);

  return { isNFCAvailable, isReading, nfcUrl, startReading, stopReading };
};
