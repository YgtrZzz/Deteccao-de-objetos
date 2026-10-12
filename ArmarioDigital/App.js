import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { initDatabase, insertItem, getItems } from './database';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Recarrega todos os itens do SQLite
  const loadInventory = useCallback(async () => {
    try {
      const data = await getItems();
      setItems(data);
    } catch (error) {
      console.error('Erro ao listar inventário:', error);
    }
  }, []);

  // 1. Inicializa o banco assim que o app abre e carrega os itens existentes
  useEffect(() => {
    async function setupDatabase() {
      try {
        await initDatabase();
        await loadInventory();
      } catch (error) {
        console.error('Falha ao inicializar banco de dados:', error);
      }
    }
    setupDatabase();
  }, [loadInventory]);

  // 2. Insere 'Objeto Escaneado' no SQLite e atualiza a FlatList em tempo real
  const handleScanItem = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await insertItem('Objeto Escaneado');
      await loadInventory();
    } catch (error) {
      alert('Não foi possível salvar o item no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  // Formata a data ISO para exibição legível
  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Estado de carregamento das permissões da câmera
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#00ffcc" />
      </View>
    );
  }

  // Permissão de câmera ainda não concedida
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

  // Tela dividida: metade superior (Câmera) + metade inferior (FlatList do Inventário)
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* METADE SUPERIOR: Câmera + Botão Sobreposto */}
      <View style={styles.topHalf}>
        <CameraView style={styles.camera} facing="back" />

        <View style={styles.cameraOverlay}>
          <TouchableOpacity
            style={[styles.scanButton, isSaving && styles.scanButtonDisabled]}
            activeOpacity={0.85}
            onPress={handleScanItem}
            disabled={isSaving}
          >
            <Text style={styles.scanButtonText}>
              {isSaving ? 'Salvando...' : 'Escanear Item'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* METADE INFERIOR: Lista de Itens do Inventário (SQLite) */}
      <View style={styles.bottomHalf}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>🗄️ Meu Inventário</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </Text>
          </View>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={
            items.length === 0 ? styles.emptyListContainer : styles.listContent
          }
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <View style={styles.itemIconBox}>
                <Text style={styles.itemIcon}>📦</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDate}>
                  ID #{item.id} • {formatDate(item.created_at)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>Nenhum item no inventário.</Text>
              <Text style={styles.emptySubtext}>
                Toque em "Escanear Item" acima para registrar o primeiro objeto.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  // Metade Superior (Câmera)
  topHalf: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  scanButton: {
    width: '100%',
    backgroundColor: 'rgba(18, 18, 18, 0.92)',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#00ffcc',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Metade Inferior (Inventário)
  bottomHalf: {
    flex: 1,
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  listTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: 'rgba(0, 255, 204, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#00ffcc',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    marginBottom: 10,
  },
  itemIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemIcon: {
    fontSize: 20,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemDate: {
    color: '#9e9e9e',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
  },
  // Tela de Permissão
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
