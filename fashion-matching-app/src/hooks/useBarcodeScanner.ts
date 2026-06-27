import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { RNCamera } from 'react-native-camera';

interface UseBarcodeScannerReturn {
  scanned: boolean;
  barcode: string | null;
  onBarcodeDetected: (event: { data: string }) => void;
  resetScan: () => void;
}

export const useBarcodeScanner = (): UseBarcodeScannerReturn => {
  const [scanned, setScanned] = useState(false);
  const [barcode, setBarcode] = useState<string | null>(null);

  const onBarcodeDetected = useCallback((event: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    const code = event.data;
    setBarcode(code);
    Alert.alert('Barcode detectat', code, [
      { text: 'OK', onPress: () => setScanned(false) },
      { text: 'Rescan', onPress: () => setScanned(false) },
    ]);
  }, [scanned]);

  const resetScan = useCallback(() => {
    setScanned(false);
    setBarcode(null);
  }, []);

  return { scanned, barcode, onBarcodeDetected, resetScan };
};
