import { useState, useCallback } from 'react';
import { launchCamera, launchImageLibrary } from 'expo-image-picker';
import { Platform, Alert } from 'react-native';

interface UseCameraReturn {
  imageUri: string | null;
  isLoading: boolean;
  takePhoto: () => Promise<void>;
  pickImage: () => Promise<void>;
  reset: () => void;
}

export const useCamera = (): UseCameraReturn => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const takePhoto = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await launchCamera({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
        exif: true,
      });
      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Eroare cameră', 'Nu am putut accesa camera.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pickImage = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await launchImageLibrary({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
        exif: true,
      });
      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Eroare galerie', 'Nu am putut accesa galeria.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => setImageUri(null), []);

  return { imageUri, isLoading, takePhoto, pickImage, reset };
};
