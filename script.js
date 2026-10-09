const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status');
const filtroSelect = document.getElementById('filtro');

// Mapear os elementos dos ecrãs
const telaBoasVindas = document.getElementById('tela-boas-vindas');
const telaAplicacao = document.getElementById('tela-aplicacao');
const btnComecar = document.getElementById('btn-comecar');

let model;

// Função para iniciar a câmara
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                canvas.width = video.clientWidth;
                canvas.height = video.clientHeight;
                resolve(video);
            };
        });
    } catch (error) {
        statusText.innerText = "Erro ao aceder à câmara. Verifique as permissões.";
        console.error(error);
    }
}

// Função principal de deteção
async function detectFrame() {
    const predictions = await model.detect(video);
    
    // Limpa o frame anterior no canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const filtroAtual = filtroSelect.value;
    
    // Desenha os objetos detetados
    predictions.forEach(prediction => {
        if (filtroAtual === 'todos' || prediction.class === filtroAtual) {
            const [x, y, width, height] = prediction.bbox;
            const text = `${prediction.class} - ${Math.round(prediction.score * 100)}%`;

            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, width, height);

            ctx.fillStyle = '#00ffcc';
            ctx.fillRect(x, y - 25, ctx.measureText(text).width + 10, 25);

            ctx.fillStyle = '#000000';
            ctx.font = '18px Arial';
            ctx.fillText(text, x + 5, y - 6);
        }
    });

    requestAnimationFrame(detectFrame);
}

// Inicialização (Agora só corre ao clicar no botão)
async function iniciarAplicacao() {
    // 1. Esconde o ecrã de boas-vindas e mostra a aplicação
    telaBoasVindas.style.display = 'none';
    telaAplicacao.style.display = 'flex';
    
    // 2. Carrega a IA
    statusText.innerText = "A carregar o modelo de IA... aguarde.";
    model = await cocoSsd.load();
    
    // 3. Liga a câmara
    statusText.innerText = "Modelo carregado! A iniciar a câmara...";
    await setupCamera();
    video.play();
    
    // 4. Inicia a deteção visual
    statusText.innerText = "Deteção ativa!";
    detectFrame();
}

// Adiciona o evento de clique ao botão "Começar"
btnComecar.addEventListener('click', iniciarAplicacao);