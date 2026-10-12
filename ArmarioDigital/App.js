import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  // 1. Estado de carregamento das permissões
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#00ffcc" />
      </View>
    );
  }

  // 2. Permissão ainda não concedida
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar style="light" />
        <View style={styles.permissionCard}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Acesso à Câmera</Text>
          <Text style={styles.permissionMessage}>
            Precisamos da sua permissão para usar a câmera e escanear os objetos
            do seu Armário Digital.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            activeOpacity={0.8}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>
              Permitir Acesso à Câmera
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 3. Permissão concedida: câmera em tela cheia + botão sobreposto
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <CameraView style={styles.camera} facing="back" />

      <View style={styles.bottomOverlay}>
        <TouchableOpacity
          style={styles.scanButton}
          activeOpacity={0.85}
          onPress={() => alert('Pronto para conectar ao SQLite!')}
        >
          <Text style={styles.scanButtonText}>Escanear Item</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  scanButton: {
    width: '100%',
    backgroundColor: 'rgba(18, 18, 18, 0.92)',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2e2e2e',
  },
  permissionIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionMessage: {
    color: '#a0a0a0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    width: '100%',
    backgroundColor: '#00ffcc',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: '700',
  },
});
