const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status');

let model;

// Função para iniciar a câmera
async function setupCamera() {
    try {
        // Pede acesso à câmera (usa a traseira no celular, se disponível)
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Ajusta o tamanho do canvas para o tamanho do vídeo
                canvas.width = video.clientWidth;
                canvas.height = video.clientHeight;
                resolve(video);
            };
        });
    } catch (error) {
        statusText.innerText = "Erro ao acessar a câmera. Verifique as permissões.";
        console.error(error);
    }
}

// Função principal de detecção
async function detectFrame() {
    // Passa o frame atual do vídeo para a IA
    const predictions = await model.detect(video);
    
    // Limpa o frame anterior no canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenha cada objeto detectado
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const text = `${prediction.class} - ${Math.round(prediction.score * 100)}%`;

        // Estilo do quadrado
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, width, height);

        // Fundo do texto
        ctx.fillStyle = '#00ffcc';
        ctx.fillRect(x, y - 25, ctx.measureText(text).width + 10, 25);

        // Texto
        ctx.fillStyle = '#000000';
        ctx.font = '18px Arial';
        ctx.fillText(text, x + 5, y - 6);
    });

    // Chama a função novamente para o próximo frame (loop contínuo)
    requestAnimationFrame(detectFrame);
}

// Inicialização do sistema
async function main() {
    // 1. Carrega o modelo
    model = await cocoSsd.load();
    statusText.innerText = "Modelo carregado! Iniciando câmera...";
    
    // 2. Liga a câmera
    await setupCamera();
    video.play();
    
    statusText.innerText = "Detecção ativa!";
    
    // 3. Começa o loop de detecção
    detectFrame();
}

// Roda o sistema
main();