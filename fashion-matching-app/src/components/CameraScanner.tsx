import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useCamera } from '../../hooks/useCamera';
import { matchProduct, checkHealth } from '../../services/api';
import { ProductMatchRequest } from '../../types';

interface Props {
  onResult: (result: any) => void;
  onBack: () => void;
}

export const CameraScanner: React.FC<Props> = ({ onResult, onBack }) => {
  const camera = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const { imageUri, isLoading, takePhoto, pickImage, reset } = useCamera();
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  React.useEffect(() => {
    if (imageUri) {
      handleMatch({ imageUri });
    }
  }, [imageUri]);

  const handleMatch = async (request: ProductMatchRequest) => {
    setProcessing(true);
    try {
      const isHealthy = await checkHealth();
      if (!isHealthy) {
        Alert.alert('Server offline', 'Matching engine-ul nu este disponibil.');
        return;
      }
      const response = await matchProduct(request);
      onResult(response);
    } catch (e: any) {
      Alert.alert('Eroare', e.message || 'Matching eșuat.');
    } finally {
      setProcessing(false);
      reset();
    }
  };

  const handleCapture = async () => {
    await takePhoto();
  };

  if (!hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.messageText}>Permisiune cameră necesară</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Acordă permisiune</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.messageText}>Cameră indisponibilă</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
      >
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backText}>← Înapoi</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Scanare Produs</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.scanFrame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
            <Text style={styles.scanHint}>Centrează produsul în cadru</Text>
          </View>

          <View style={styles.bottomBar}>
            {(processing || isLoading) && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.processingText}>Analizez imaginea...</Text>
              </View>
            )}

            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
                <Text style={styles.galleryText}>Galerie</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                <View style={styles.captureOuter}>
                  <View style={styles.captureInner} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.flipButton} onPress={() => {}}>
                <Text style={styles.flipText}>Flip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Camera>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 32,
  },
  messageText: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 16 },
  primaryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backButton: { padding: 8 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  scanFrame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 40,
    marginVertical: 20,
  },
  cornerTL: { position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#4CAF50' },
  cornerTR: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#4CAF50' },
  cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#4CAF50' },
  cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#4CAF50' },
  scanHint: { color: '#fff', fontSize: 14, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 8, marginTop: 20 },
  bottomBar: { paddingBottom: 40, alignItems: 'center' },
  processingContainer: { alignItems: 'center', marginBottom: 20 },
  processingText: { color: '#fff', fontSize: 14, marginTop: 8, fontWeight: '600' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', paddingHorizontal: 40 },
  galleryButton: { padding: 12 },
  galleryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  captureButton: { padding: 10 },
  captureOuter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', borderWidth: 3, borderColor: '#4CAF50' },
  flipButton: { padding: 12 },
  flipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
