import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { ResultsDisplay } from '../components/ResultsDisplay';
import { MatchResponse } from '../types';
import { reportMismatch } from '../services/api';

interface ResultsScreenProps {
  route: { params: { result: MatchResponse } };
  navigation: any;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ route, navigation }) => {
  const { result } = route.params;

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Rezultate Matching',
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              'Raportează eroare',
              'Consideri că acest match este incorect?',
              [
                { text: 'Anulează', style: 'cancel' },
                {
                  text: 'Raportează',
                  onPress: () => {
                    reportMismatch({
                      productId: result.product.id,
                      expectedId: result.product.id,
                      reason: 'User reported mismatch',
                    }).catch(() => {});
                    Alert.alert('Mulțumim', 'Feedback-ul a fost înregistrat.');
                  },
                },
              ]
            );
          }}
          style={{ marginRight: 16 }}
        >
          <Text style={styles.reportText}>⚠️</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, result]);

  const handleProductPress = (product: any) => {
    navigation.navigate('ProductDetail', { product });
  };

  const handleRetry = () => {
    navigation.navigate('Scan' as never, { mode: 'camera' } as never);
  };

  return (
    <View style={styles.container}>
      <ResultsDisplay result={result} onProductPress={handleProductPress} onRetry={handleRetry} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  reportText: { fontSize: 20 },
});
