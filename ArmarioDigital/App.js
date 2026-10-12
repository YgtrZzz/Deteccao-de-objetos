import { useCallback, useEffect, useRef, useState } from 'react';
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
import * as tf from '@tensorflow/tfjs';
import { decodeJpeg, fetch as tfFetch } from '@tensorflow/tfjs-react-native';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { initDatabase, insertItem, getItems } from './database';

/**
 * Dicionário simples para traduzir as categorias mais comuns do MobileNet (ImageNet)
 * do inglês para o português.
 */
const TRADUCOES_MOBILENET = {
  laptop: 'Notebook',
  'notebook computer': 'Notebook',
  notebook: 'Notebook',
  'desktop computer': 'Computador de Mesa',
  monitor: 'Monitor',
  screen: 'Monitor / Tela',
  'computer keyboard': 'Teclado',
  keypad: 'Teclado',
  mouse: 'Mouse',
  'computer mouse': 'Mouse',
  'cellular telephone': 'Celular',
  'cellular phone': 'Celular',
  cellphone: 'Celular',
  'mobile phone': 'Celular',
  ipod: 'Celular / Reprodutor',
  'remote control': 'Controle Remoto',
  remote: 'Controle Remoto',
  television: 'Televisão',
  chair: 'Cadeira',
  'folding chair': 'Cadeira Dobrável',
  'rocking chair': 'Cadeira de Balanço',
  'barber chair': 'Cadeira',
  desk: 'Escrivaninha / Mesa',
  'dining table': 'Mesa de Jantar',
  bookcase: 'Estante de Livros',
  wardrobe: 'Guarda-Roupa',
  bottle: 'Garrafa',
  'water bottle': 'Garrafa de Água',
  'pop bottle': 'Garrafa de Refrigerante',
  'wine bottle': 'Garrafa de Vinho',
  'beer bottle': 'Garrafa',
  'pill bottle': 'Frasco de Remédio',
  'coffee mug': 'Caneca',
  mug: 'Caneca',
  cup: 'Xícara / Copo',
  espresso: 'Xícara de Café',
  'water jug': 'Jarra de Água',
  teapot: 'Bule',
  plate: 'Prato',
  bowl: 'Tigela',
  backpack: 'Mochila',
  handbag: 'Bolsa',
  purse: 'Bolsa',
  wallet: 'Carteira',
  umbrella: 'Guarda-Chuva',
  sunglasses: 'Óculos de Sol',
  eyeglasses: 'Óculos',
  watch: 'Relógio',
  'digital watch': 'Relógio Digital',
  'wall clock': 'Relógio de Parede',
  'analog clock': 'Relógio Analógico',
  'running shoe': 'Tênis',
  shoe: 'Calçado',
  sandal: 'Sandália',
  boot: 'Bota',
  jean: 'Calça Jeans',
  't-shirt': 'Camiseta',
  jersey: 'Camisa',
  sweatshirt: 'Moletom',
  suit: 'Terno',
  coat: 'Casaco',
  pillow: 'Travesseiro / Almofada',
  'book jacket': 'Livro',
  'comic book': 'Livro / Quadrinho',
  binder: 'Caderno / Fichário',
  envelope: 'Envelope',
  ballpoint: 'Caneta',
  'fountain pen': 'Caneta',
  'pencil box': 'Estojo',
  'rubber eraser': 'Borracha',
  ruler: 'Régua',
  scissors: 'Tesoura',
  screwdriver: 'Chave de Fenda',
  hammer: 'Martelo',
  padlock: 'Cadeado',
  flashlight: 'Lanterna',
  'table lamp': 'Luminária de Mesa',
  lampshade: 'Abajur',
  'electric fan': 'Ventilador',
  iron: 'Ferro de Passar',
  vacuum: 'Aspirador de Pó',
  toaster: 'Torradeira',
  microwave: 'Micro-ondas',
  refrigerator: 'Geladeira',
  headphone: 'Fone de Ouvido',
  earphone: 'Fone de Ouvido',
  loudspeaker: 'Caixa de Som',
  microphone: 'Microfone',
  'acoustic guitar': 'Violão',
  'electric guitar': 'Guitarra',
  vase: 'Vaso',
  flowerpot: 'Vaso de Planta',
  perfume: 'Perfume',
  lotion: 'Loção / Creme',
  'soap dispenser': 'Saboneteira',
  'paper towel': 'Papel Toalha',
  'bath towel': 'Toalha de Banho',
  banana: 'Banana',
  orange: 'Laranja',
  apple: 'Maçã',
};

/**
 * Traduz a classe retornada pelo MobileNet (ex: "laptop, laptop computer")
 * para o português ou mantém o nome original caso não haja tradução.
 * @param {string} rawClassName
 * @returns {string}
 */
function traduzirCategoria(rawClassName) {
  if (!rawClassName) return 'Objeto Identificado';

  const termos = rawClassName
    .toLowerCase()
    .split(',')
    .map((termo) => termo.trim());

  // 1. Busca correspondência exata em qualquer um dos sinônimos retornados pelo MobileNet
  for (const termo of termos) {
    if (TRADUCOES_MOBILENET[termo]) {
      return TRADUCOES_MOBILENET[termo];
    }
  }

  // 2. Busca por palavra-chave contida no nome da classe
  const textoCompleto = rawClassName.toLowerCase();
  for (const [chaveIngles, valorPortugues] of Object.entries(TRADUCOES_MOBILENET)) {
    if (textoCompleto.includes(chaveIngles)) {
      return valorPortugues;
    }
  }

  // 3. Se não houver tradução no dicionário, mantém o primeiro termo original capitalizado
  const original = rawClassName.split(',')[0].trim();
  return original.charAt(0).toUpperCase() + original.slice(1);
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState([]);
  const [model, setModel] = useState(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const cameraRef = useRef(null);

  // Recarrega todos os itens do SQLite
  const loadInventory = useCallback(async () => {
    try {
      const data = await getItems();
      setItems(data);
    } catch (error) {
      console.error('Erro ao listar inventário:', error);
    }
  }, []);

  // Inicializa o SQLite e carrega o TensorFlow.js + MobileNet em background
  useEffect(() => {
    let isMounted = true;

    async function initializeApp() {
      // 1. Inicializa o banco de dados local SQLite
      try {
        await initDatabase();
        await loadInventory();
      } catch (dbError) {
        console.error('Falha ao inicializar banco de dados:', dbError);
      }

      // 2. Inicializa o TensorFlow.js e carrega o modelo MobileNet em background
      try {
        await tf.ready();
        const loadedModel = await mobilenet.load();
        if (isMounted) {
          setModel(loadedModel);
          setIsModelReady(true);
        }
      } catch (tfError) {
        console.error('Falha ao carregar TensorFlow/MobileNet:', tfError);
      }
    }

    initializeApp();

    return () => {
      isMounted = false;
    };
  }, [loadInventory]);

  // Captura a foto na CameraView, classifica no MobileNet, traduz e salva no SQLite
  const handleScanItem = async () => {
    if (isScanning) return;

    if (!isModelReady || !model) {
      alert('Aguarde um instante: o modelo de IA ainda está sendo carregado.');
      return;
    }

    if (!cameraRef.current) {
      alert('A câmera ainda não está pronta.');
      return;
    }

    setIsScanning(true);
    let imageTensor = null;

    try {
      // 1. Captura a foto em formato JPEG com base64
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
      });

      // 2. Converte os bytes JPEG para um Tensor 3D compatível com o MobileNet
      let rawImageData;
      if (photo?.base64) {
        rawImageData = tf.util.encodeString(photo.base64, 'base64');
      } else if (photo?.uri) {
        const response = await tfFetch(photo.uri, {}, { isBinary: true });
        const arrayBuffer = await response.arrayBuffer();
        rawImageData = new Uint8Array(arrayBuffer);
      } else {
        throw new Error('Não foi possível obter os dados da imagem capturada.');
      }

      imageTensor = decodeJpeg(rawImageData);

      // 3. Classifica a imagem no MobileNet
      const predictions = await model.classify(imageTensor);

      if (!predictions || predictions.length === 0) {
        throw new Error('Nenhuma predição retornada pelo modelo.');
      }

      // 4. Seleciona a predição de maior probabilidade e traduz para português
      const topPrediction = [...predictions].sort(
        (a, b) => b.probability - a.probability
      )[0];

      const nomeTraduzido = traduzirCategoria(topPrediction.className);

      // 5. Insere o nome real no SQLite e atualiza a FlatList imediatamente
      await insertItem(nomeTraduzido);
      await loadInventory();
    } catch (error) {
      console.error('Erro ao escanear e classificar item:', error);
      alert('Não foi possível identificar o objeto. Tente aproximar a câmera.');
    } finally {
      // Libera a memória do tensor na GPU/CPU
      if (imageTensor) {
        tf.dispose(imageTensor);
      }
      setIsScanning(false);
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

  // Tela dividida: metade superior (Câmera + IA) + metade inferior (FlatList do Inventário)
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* METADE SUPERIOR: Câmera + Aviso da IA + Botão Sobreposto */}
      <View style={styles.topHalf}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        {/* Aviso 'Carregando IA...' visível até que o modelo MobileNet esteja 100% pronto */}
        {!isModelReady && (
          <View style={styles.aiStatusBadge}>
            <ActivityIndicator size="small" color="#00ffcc" />
            <Text style={styles.aiStatusText}>Carregando IA...</Text>
          </View>
        )}

        <View style={styles.cameraOverlay}>
          <TouchableOpacity
            style={[
              styles.scanButton,
              (!isModelReady || isScanning) && styles.scanButtonDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleScanItem}
            disabled={!isModelReady || isScanning}
          >
            <Text style={styles.scanButtonText}>
              {isScanning
                ? 'Analisando objeto...'
                : !isModelReady
                  ? 'Aguardando IA...'
                  : 'Escanear Item'}
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
                Aponte a câmera para um objeto e toque em "Escanear Item".
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
  aiStatusBadge: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(18, 18, 18, 0.88)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#00ffcc',
  },
  aiStatusText: {
    color: '#00ffcc',
    fontSize: 13,
    fontWeight: '700',
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
    borderColor: '#555555',
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
