/* ==========================================================
   Armário Digital — Lógica da aplicação
   ----------------------------------------------------------
   Camadas:
     1. Banco    -> persistência e regras de dados (localStorage)
     2. Modal    -> diálogos reutilizáveis (prompt / confirmação)
     3. Camera   -> acesso à câmera e captura de frames
     4. IA       -> analisarImagem() (simulada por enquanto)
     5. UI       -> renderização e eventos das abas
   Hierarquia: Ambiente -> Contêiner -> Itens[]
   ========================================================== */

'use strict';

/* ==========================================================
   1. BANCO DE DADOS LOCAL (localStorage)
   ========================================================== */
const Banco = (() => {
    const CHAVE_DADOS = 'armarioDigital:dados';
    const CHAVE_SELECAO = 'armarioDigital:selecao';
    const VERSAO_SCHEMA = 1;

    /** Estrutura inicial do banco. */
    const estadoInicial = () => ({ versao: VERSAO_SCHEMA, ambientes: [] });

    /** Gera um ID único (usa crypto quando disponível). */
    const gerarId = () =>
        (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

    /** Normaliza e valida nomes digitados pelo usuário. */
    const normalizarNome = (nome, maximo = 40) => {
        const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ');
        if (!limpo) throw new Error('O nome não pode ficar vazio.');
        if (limpo.length > maximo) throw new Error(`O nome deve ter no máximo ${maximo} caracteres.`);
        return limpo;
    };

    /** Impede nomes duplicados (sem diferenciar maiúsculas/acentos). */
    const chaveComparacao = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const garantirUnico = (lista, nome, ignorarId = null) => {
        const alvo = chaveComparacao(nome);
        if (lista.some((x) => x.id !== ignorarId && chaveComparacao(x.nome) === alvo)) {
            throw new Error(`Já existe "${nome}".`);
        }
    };

    /** Lê os dados do localStorage com tolerância a dados corrompidos. */
    function carregar() {
        try {
            const bruto = localStorage.getItem(CHAVE_DADOS);
            if (!bruto) return estadoInicial();
            const dados = JSON.parse(bruto);
            if (!dados || !Array.isArray(dados.ambientes)) return estadoInicial();
            return migrar(dados);
        } catch (erro) {
            console.error('[Banco] Dados inválidos no localStorage. Reiniciando.', erro);
            return estadoInicial();
        }
    }

    /** Ponto central para futuras migrações de schema. */
    function migrar(dados) {
        // Exemplo futuro: if (dados.versao < 2) { ... }
        dados.versao = VERSAO_SCHEMA;
        dados.ambientes.forEach((a) => {
            a.conteineres = Array.isArray(a.conteineres) ? a.conteineres : [];
            a.conteineres.forEach((c) => { c.itens = Array.isArray(c.itens) ? c.itens : []; });
        });
        return dados;
    }

    let dados = carregar();

    /** Persiste o estado atual. */
    function salvar() {
        try {
            localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
        } catch (erro) {
            // Ex.: QuotaExceededError ou modo privado
            console.error('[Banco] Falha ao salvar.', erro);
            throw new Error('Não foi possível salvar: armazenamento do dispositivo cheio ou indisponível.');
        }
    }

    /* ---------- Consultas ---------- */
    const listarAmbientes = () => dados.ambientes;
    const obterAmbiente = (id) => dados.ambientes.find((a) => a.id === id) || null;
    const obterConteiner = (ambienteId, conteinerId) =>
        obterAmbiente(ambienteId)?.conteineres.find((c) => c.id === conteinerId) || null;

    function obterAmbienteOuFalhar(id) {
        const ambiente = obterAmbiente(id);
        if (!ambiente) throw new Error('Ambiente não encontrado.');
        return ambiente;
    }

    function obterConteinerOuFalhar(ambienteId, conteinerId) {
        const conteiner = obterAmbienteOuFalhar(ambienteId).conteineres.find((c) => c.id === conteinerId);
        if (!conteiner) throw new Error('Contêiner não encontrado.');
        return conteiner;
    }

    /* ---------- Ambientes ---------- */
    function criarAmbiente(nome) {
        const nomeOk = normalizarNome(nome);
        garantirUnico(dados.ambientes, nomeOk);
        const ambiente = { id: gerarId(), nome: nomeOk, criadoEm: new Date().toISOString(), conteineres: [] };
        dados.ambientes.push(ambiente);
        salvar();
        return ambiente;
    }

    function renomearAmbiente(id, novoNome) {
        const ambiente = obterAmbienteOuFalhar(id);
        const nomeOk = normalizarNome(novoNome);
        garantirUnico(dados.ambientes, nomeOk, id);
        ambiente.nome = nomeOk;
        salvar();
        return ambiente;
    }

    function removerAmbiente(id) {
        dados.ambientes = dados.ambientes.filter((a) => a.id !== id);
        salvar();
    }

    /* ---------- Contêineres ---------- */
    function criarConteiner(ambienteId, nome) {
        const ambiente = obterAmbienteOuFalhar(ambienteId);
        const nomeOk = normalizarNome(nome);
        garantirUnico(ambiente.conteineres, nomeOk);
        const conteiner = { id: gerarId(), nome: nomeOk, criadoEm: new Date().toISOString(), itens: [] };
        ambiente.conteineres.push(conteiner);
        salvar();
        return conteiner;
    }

    function renomearConteiner(ambienteId, conteinerId, novoNome) {
        const ambiente = obterAmbienteOuFalhar(ambienteId);
        const conteiner = obterConteinerOuFalhar(ambienteId, conteinerId);
        const nomeOk = normalizarNome(novoNome);
        garantirUnico(ambiente.conteineres, nomeOk, conteinerId);
        conteiner.nome = nomeOk;
        salvar();
        return conteiner;
    }

    function removerConteiner(ambienteId, conteinerId) {
        const ambiente = obterAmbienteOuFalhar(ambienteId);
        ambiente.conteineres = ambiente.conteineres.filter((c) => c.id !== conteinerId);
        salvar();
    }

    /* ---------- Itens ---------- */
    /**
     * Adiciona um item ao contêiner.
     * @param {{nome: string, foto?: string}} item  foto = miniatura em data URL (opcional)
     * Itens podem ter nomes repetidos (ex.: duas canecas iguais).
     */
    function adicionarItem(ambienteId, conteinerId, { nome, foto = null }) {
        const conteiner = obterConteinerOuFalhar(ambienteId, conteinerId);
        const item = { id: gerarId(), nome: normalizarNome(nome, 60), foto, criadoEm: new Date().toISOString() };
        conteiner.itens.push(item);
        try {
            salvar();
        } catch (erro) {
            conteiner.itens.pop(); // rollback: mantém memória e disco consistentes
            throw erro;
        }
        return item;
    }

    function removerItem(ambienteId, conteinerId, itemId) {
        const conteiner = obterConteinerOuFalhar(ambienteId, conteinerId);
        conteiner.itens = conteiner.itens.filter((i) => i.id !== itemId);
        salvar();
    }

    /* ---------- Seleção do local de escaneamento ---------- */
    function obterSelecao() {
        try {
            const sel = JSON.parse(localStorage.getItem(CHAVE_SELECAO)) || {};
            // Descarta seleção que aponta para algo que já foi excluído
            const ambienteId = obterAmbiente(sel.ambienteId) ? sel.ambienteId : null;
            const conteinerId = ambienteId && obterConteiner(ambienteId, sel.conteinerId) ? sel.conteinerId : null;
            return { ambienteId, conteinerId };
        } catch {
            return { ambienteId: null, conteinerId: null };
        }
    }

    function definirSelecao(ambienteId, conteinerId) {
        localStorage.setItem(CHAVE_SELECAO, JSON.stringify({ ambienteId: ambienteId || null, conteinerId: conteinerId || null }));
    }

    /* ---------- Estatísticas ---------- */
    function resumo() {
        const ambientes = dados.ambientes.length;
        const conteineres = dados.ambientes.reduce((t, a) => t + a.conteineres.length, 0);
        const itens = dados.ambientes.reduce((t, a) => t + a.conteineres.reduce((s, c) => s + c.itens.length, 0), 0);
        return { ambientes, conteineres, itens };
    }

    return {
        listarAmbientes, obterAmbiente, obterConteiner,
        criarAmbiente, renomearAmbiente, removerAmbiente,
        criarConteiner, renomearConteiner, removerConteiner,
        adicionarItem, removerItem,
        obterSelecao, definirSelecao, resumo,
    };
})();

/* ==========================================================
   2. MODAL REUTILIZÁVEL (substitui prompt/confirm nativos)
   ========================================================== */
const Modal = (() => {
    const dialog = document.getElementById('modal');
    const form = document.getElementById('modal-form');
    const titulo = document.getElementById('modal-titulo');
    const mensagem = document.getElementById('modal-mensagem');
    const input = document.getElementById('modal-input');
    const btnOk = document.getElementById('modal-ok');
    const btnCancelar = document.getElementById('modal-cancelar');

    function abrir({ tituloTexto, mensagemTexto = '', comInput = false, valor = '', textoOk = 'Salvar', perigo = false }) {
        return new Promise((resolve) => {
            titulo.textContent = tituloTexto;
            mensagem.textContent = mensagemTexto;
            input.hidden = !comInput;
            input.required = comInput;
            input.value = valor;
            btnOk.textContent = textoOk;
            btnOk.className = `btn ${perigo ? 'btn-perigo' : 'btn-primario'}`;

            const finalizar = (resultado) => {
                form.removeEventListener('submit', aoConfirmar);
                btnCancelar.removeEventListener('click', aoCancelar);
                dialog.removeEventListener('cancel', aoCancelar);
                if (dialog.open) dialog.close();
                resolve(resultado);
            };
            const aoConfirmar = (e) => {
                e.preventDefault();
                finalizar(comInput ? input.value : true);
            };
            const aoCancelar = (e) => {
                e?.preventDefault();
                finalizar(null);
            };

            form.addEventListener('submit', aoConfirmar);
            btnCancelar.addEventListener('click', aoCancelar);
            dialog.addEventListener('cancel', aoCancelar); // tecla ESC

            dialog.showModal();
            if (comInput) { input.focus(); input.select(); }
        });
    }

    return {
        pedirTexto: (tituloTexto, valor = '') => abrir({ tituloTexto, comInput: true, valor }),
        confirmar: (tituloTexto, mensagemTexto, textoOk = 'Excluir') =>
            abrir({ tituloTexto, mensagemTexto, textoOk, perigo: true }).then(Boolean),
    };
})();

/* ==========================================================
   3. CÂMERA (navigator.mediaDevices)
   ========================================================== */
const Camera = (() => {
    let stream = null;
    let ligando = null;  // Promise em andamento (evita pedir a câmera duas vezes)
    let geracao = 0;     // Invalida aberturas que terminaram depois de um desligar()

    /** Converte erros do getUserMedia em mensagens amigáveis. */
    function traduzirErro(erro) {
        switch (erro?.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'Permissão da câmera negada. Libere o acesso nas configurações do navegador.';
            case 'NotFoundError':
            case 'OverconstrainedError':
                return 'Nenhuma câmera foi encontrada neste dispositivo.';
            case 'NotReadableError':
            case 'AbortError':
                return 'A câmera está sendo usada por outro aplicativo.';
            default:
                return erro?.message || 'Não foi possível acessar a câmera.';
        }
    }

    /** Liga a câmera traseira e conecta o stream ao <video>. */
    function ligar(video) {
        if (stream) return Promise.resolve();
        if (ligando) return ligando;

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            return Promise.reject(new Error('A câmera exige HTTPS (ou localhost) e um navegador compatível.'));
        }

        const minhaGeracao = ++geracao;
        ligando = (async () => {
            try {
                const novoStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        // "ideal" prefere a traseira, mas não falha em notebooks (só câmera frontal)
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                });
                // desligar() foi chamado enquanto aguardávamos a permissão
                if (minhaGeracao !== geracao) {
                    novoStream.getTracks().forEach((t) => t.stop());
                    return;
                }
                stream = novoStream;
                video.srcObject = stream;
                await video.play();
            } catch (erro) {
                throw new Error(traduzirErro(erro));
            } finally {
                ligando = null;
            }
        })();
        return ligando;
    }

    /** Libera a câmera (apaga o LED e economiza bateria). */
    function desligar(video) {
        geracao++;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        if (video) video.srcObject = null;
    }

    const estaLigada = () => !!stream;

    /**
     * Desenha o frame atual do vídeo no canvas e devolve um JPEG em base64.
     * A imagem é reduzida para no máximo `ladoMaximo` px (payload menor para a API).
     */
    function capturarFrame(video, canvas, ladoMaximo = 1024, qualidade = 0.85) {
        const { videoWidth: w, videoHeight: h } = video;
        if (!w || !h) throw new Error('A câmera ainda não está pronta.');

        const escala = Math.min(1, ladoMaximo / Math.max(w, h));
        canvas.width = Math.round(w * escala);
        canvas.height = Math.round(h * escala);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', qualidade);
    }

    /**
     * Gera uma miniatura quadrada (recorte central) a partir do canvas já desenhado.
     * É ela que vai para o localStorage — a foto completa estouraria a cota (~5 MB).
     */
    function gerarMiniatura(canvasOrigem, tamanho = 160, qualidade = 0.7) {
        const lado = Math.min(canvasOrigem.width, canvasOrigem.height);
        const sx = (canvasOrigem.width - lado) / 2;
        const sy = (canvasOrigem.height - lado) / 2;
        const mini = document.createElement('canvas');
        mini.width = mini.height = tamanho;
        mini.getContext('2d').drawImage(canvasOrigem, sx, sy, lado, lado, 0, 0, tamanho, tamanho);
        return mini.toDataURL('image/jpeg', qualidade);
    }

    return { ligar, desligar, estaLigada, capturarFrame, gerarMiniatura };
})();

/* ==========================================================
   4. IA — análise da imagem (POST /api/analyze)
   ----------------------------------------------------------
   Envia a imagem base64 capturada para a Serverless Function
   na Vercel, que se conecta com a API do Google Gemini.
   ========================================================== */

/**
 * Analisa uma imagem enviando-a para o endpoint /api/analyze.
 * @param {string} base64  Data URL da imagem (data:image/jpeg;base64,...)
 * @returns {Promise<string>} Nome do objeto identificado
 */
async function analisarImagem(base64) {
    if (typeof base64 !== 'string' || !base64.startsWith('data:image/')) {
        throw new Error('Imagem inválida para análise.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 8000);

    try {
        const resposta = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: base64 }),
            signal: controller.signal,
        });

        const dados = await resposta.json().catch(() => null);

        if (!resposta.ok) {
            const mensagem = dados?.error || `Falha na análise (${resposta.status})`;
            throw new Error(mensagem);
        }

        const nome = dados?.objeto || dados?.nome;
        if (!nome) {
            throw new Error('A IA não retornou um nome válido para o objeto.');
        }

        return nome;
    } catch (erro) {
        if (erro.name === 'AbortError') {
            throw new Error('Tempo limite excedido (8s). O servidor demorou para responder.');
        }
        throw erro;
    } finally {
        clearTimeout(timeoutId);
    }
}

/* ==========================================================
   5. INTERFACE
   ========================================================== */
const UI = (() => {
    // Elementos
    const el = {
        resumo: document.getElementById('resumo'),
        tabs: document.querySelectorAll('.tab'),
        telas: document.querySelectorAll('.tela'),
        formAmbiente: document.getElementById('form-ambiente'),
        inputAmbiente: document.getElementById('input-ambiente'),
        listaAmbientes: document.getElementById('lista-ambientes'),
        vazioLocais: document.getElementById('vazio-locais'),
        selectAmbiente: document.getElementById('select-ambiente'),
        selectConteiner: document.getElementById('select-conteiner'),
        avisoEscanear: document.getElementById('aviso-escanear'),
        destinoAtual: document.getElementById('destino-atual'),
        destinoItens: document.getElementById('destino-itens'),
        toast: document.getElementById('toast'),
        // Câmera
        camera: document.getElementById('camera'),
        video: document.getElementById('camera-video'),
        foto: document.getElementById('camera-foto'),
        canvas: document.getElementById('camera-canvas'),
        overlay: document.getElementById('camera-overlay'),
        cameraStatus: document.getElementById('camera-status'),
        btnCameraLigar: document.getElementById('btn-camera-ligar'),
        analisando: document.getElementById('camera-analisando'),
        btnCapturar: document.getElementById('btn-capturar'),
        painelResultado: document.getElementById('painel-resultado'),
        inputItem: document.getElementById('input-item'),
        avisoSalvar: document.getElementById('aviso-salvar'),
        btnRefazer: document.getElementById('btn-refazer'),
        btnSalvarItem: document.getElementById('btn-salvar-item'),
    };

    // Estado apenas visual (não persistido): quais ambientes estão expandidos
    const ambientesAbertos = new Set();

    /* ---------- Estado do scanner ----------
       desligada -> iniciando -> ao-vivo -> analisando -> resultado
                        \-> erro                  \-> (refazer) ao-vivo         */
    const scanner = {
        estado: 'desligada',
        miniatura: null,   // data URL pequena que será salva com o item
        tokenAnalise: 0,   // descarta respostas de análises canceladas
    };

    /* ---------- Utilidades ---------- */
    const escapar = (texto) =>
        String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const plural = (n, singular, pluralTxt) => `${n} ${n === 1 ? singular : pluralTxt}`;

    const telaAtiva = () => document.querySelector('.tela.ativa')?.id;

    let toastTimer;
    function toast(mensagem) {
        el.toast.textContent = mensagem;
        el.toast.classList.add('visivel');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.toast.classList.remove('visivel'), 2500);
    }

    /** Executa uma ação do Banco exibindo erros de validação de forma amigável. */
    function tentar(acao, mensagemSucesso) {
        try {
            const resultado = acao();
            if (mensagemSucesso) toast(mensagemSucesso);
            renderizarTudo();
            return resultado ?? true;
        } catch (erro) {
            toast(`⚠️ ${erro.message}`);
            return null;
        }
    }

    /* ---------- Navegação por abas ---------- */
    function mostrarTela(idTela) {
        el.tabs.forEach((tab) => {
            const ativa = tab.dataset.tela === idTela;
            tab.classList.toggle('ativa', ativa);
            tab.setAttribute('aria-selected', String(ativa));
        });
        el.telas.forEach((tela) => {
            const ativa = tela.id === idTela;
            tela.hidden = !ativa;
            tela.classList.toggle('ativa', ativa);
        });

        if (idTela === 'tela-escanear') {
            renderizarEscanear();
            if (['desligada', 'erro'].includes(scanner.estado)) ligarCamera();
        } else {
            desligarCamera();
        }
    }

    /* ---------- Renderização: Resumo ---------- */
    function renderizarResumo() {
        const { ambientes, conteineres, itens } = Banco.resumo();
        el.resumo.textContent =
            `${plural(ambientes, 'ambiente', 'ambientes')} · ${plural(conteineres, 'contêiner', 'contêineres')} · ${plural(itens, 'item', 'itens')}`;
    }

    /* ---------- Renderização: Meus Locais ---------- */
    function htmlItem(ambienteId, conteinerId, item) {
        // A foto é sempre um data URL gerado pelo próprio app; ainda assim validamos o prefixo
        const foto = typeof item.foto === 'string' && item.foto.startsWith('data:image/')
            ? `<img src="${item.foto}" alt="" loading="lazy">`
            : '';
        return `
            <li class="item">
                ${foto}
                <span class="item-nome">${escapar(item.nome)}</span>
                <button class="btn-icone perigo" data-acao="remover-item" data-ambiente="${ambienteId}" data-conteiner="${conteinerId}" data-item="${item.id}" aria-label="Excluir item">✕</button>
            </li>`;
    }

    function htmlConteiner(ambienteId, c) {
        const itens = c.itens.length
            ? `<ul class="lista-itens">${c.itens.map((i) => htmlItem(ambienteId, c.id, i)).join('')}</ul>`
            : '';
        return `
            <li class="conteiner">
                <span class="conteiner-nome">📦 ${escapar(c.nome)}</span>
                <span class="badge">${plural(c.itens.length, 'item', 'itens')}</span>
                <button class="btn-icone" data-acao="renomear-conteiner" data-ambiente="${ambienteId}" data-conteiner="${c.id}" aria-label="Renomear contêiner">✏️</button>
                <button class="btn-icone perigo" data-acao="remover-conteiner" data-ambiente="${ambienteId}" data-conteiner="${c.id}" aria-label="Excluir contêiner">🗑️</button>
                ${itens}
            </li>`;
    }

    function htmlAmbiente(a) {
        const aberto = ambientesAbertos.has(a.id);
        const conteineres = a.conteineres.length
            ? `<ul class="lista-conteineres">${a.conteineres.map((c) => htmlConteiner(a.id, c)).join('')}</ul>`
            : `<p class="conteiner-vazio">Nenhum contêiner neste ambiente.</p>`;

        return `
            <li class="ambiente ${aberto ? 'aberto' : ''}" data-id="${a.id}">
                <div class="ambiente-cabecalho">
                    <button class="ambiente-toggle" data-acao="alternar" data-ambiente="${a.id}" aria-expanded="${aberto}">
                        <span class="seta">▶</span>
                        <span class="ambiente-nome">🏠 ${escapar(a.nome)}</span>
                    </button>
                    <span class="badge">${plural(a.conteineres.length, 'contêiner', 'contêineres')}</span>
                    <button class="btn-icone" data-acao="renomear-ambiente" data-ambiente="${a.id}" aria-label="Renomear ambiente">✏️</button>
                    <button class="btn-icone perigo" data-acao="remover-ambiente" data-ambiente="${a.id}" aria-label="Excluir ambiente">🗑️</button>
                </div>
                <div class="ambiente-corpo">
                    ${conteineres}
                    <form class="form-inline form-conteiner" data-ambiente="${a.id}" autocomplete="off">
                        <input type="text" name="nome" placeholder="Novo contêiner (ex: Armário 1)" maxlength="40" required>
                        <button type="submit" class="btn btn-primario" aria-label="Adicionar contêiner">＋</button>
                    </form>
                </div>
            </li>`;
    }

    function renderizarLocais() {
        const ambientes = Banco.listarAmbientes();
        el.vazioLocais.hidden = ambientes.length > 0;
        el.listaAmbientes.innerHTML = ambientes.map(htmlAmbiente).join('');
    }

    /* ---------- Renderização: Escanear ---------- */
    function preencherSelect(select, opcoes, placeholder, valorSelecionado) {
        select.innerHTML =
            `<option value="">${placeholder}</option>` +
            opcoes.map((o) => `<option value="${o.id}" ${o.id === valorSelecionado ? 'selected' : ''}>${escapar(o.nome)}</option>`).join('');
    }

    function renderizarEscanear() {
        const ambientes = Banco.listarAmbientes();
        const { ambienteId, conteinerId } = Banco.obterSelecao();

        preencherSelect(el.selectAmbiente, ambientes, ambientes.length ? 'Selecione um ambiente' : 'Nenhum ambiente cadastrado', ambienteId);
        el.selectAmbiente.disabled = ambientes.length === 0;

        const ambiente = Banco.obterAmbiente(ambienteId);
        const conteineres = ambiente ? ambiente.conteineres : [];
        preencherSelect(
            el.selectConteiner,
            conteineres,
            !ambiente ? 'Selecione um ambiente primeiro' : conteineres.length ? 'Selecione um contêiner' : 'Nenhum contêiner neste ambiente',
            conteinerId
        );
        el.selectConteiner.disabled = !ambiente || conteineres.length === 0;

        // Avisos contextuais
        let aviso = '';
        if (!ambientes.length) aviso = 'Cadastre um ambiente na aba "Meus Locais".';
        else if (ambiente && !conteineres.length) aviso = `Adicione um contêiner em "${ambiente.nome}" na aba "Meus Locais".`;
        el.avisoEscanear.textContent = aviso;
        el.avisoEscanear.hidden = !aviso;

        // Destino atual
        const conteiner = Banco.obterConteiner(ambienteId, conteinerId);
        if (ambiente && conteiner) {
            el.destinoAtual.textContent = `${ambiente.nome} › ${conteiner.nome}`;
            el.destinoItens.textContent = `${plural(conteiner.itens.length, 'item guardado', 'itens guardados')}`;
        } else {
            el.destinoAtual.textContent = 'Nenhum local selecionado';
            el.destinoItens.textContent = '';
        }

        // O botão "Salvar" depende de haver um destino válido
        el.btnSalvarItem.disabled = !conteiner;
        el.avisoSalvar.hidden = !!conteiner;
    }

    function renderizarTudo() {
        renderizarResumo();
        renderizarLocais();
        renderizarEscanear();
    }

    /* ---------- Scanner: máquina de estados ---------- */
    function definirEstadoScanner(estado, mensagem = '') {
        scanner.estado = estado;
        el.camera.dataset.estado = estado;

        const mostrarOverlay = ['desligada', 'iniciando', 'erro'].includes(estado);
        el.overlay.hidden = !mostrarOverlay;
        if (mostrarOverlay) {
            el.cameraStatus.textContent = mensagem || {
                desligada: 'Câmera desligada.',
                iniciando: 'Iniciando câmera...',
                erro: 'Não foi possível acessar a câmera.',
            }[estado];
        }
        el.btnCameraLigar.hidden = estado !== 'erro';

        const fotoCongelada = estado === 'analisando' || estado === 'resultado';
        el.foto.hidden = !fotoCongelada;
        el.analisando.hidden = estado !== 'analisando';

        el.btnCapturar.hidden = estado === 'resultado';
        el.btnCapturar.disabled = estado !== 'ao-vivo';
        el.painelResultado.hidden = estado !== 'resultado';
    }

    async function ligarCamera() {
        definirEstadoScanner('iniciando');
        try {
            await Camera.ligar(el.video);
            // O usuário pode ter trocado de aba enquanto a permissão era pedida
            if (telaAtiva() !== 'tela-escanear') return desligarCamera();
            if (scanner.estado === 'iniciando') definirEstadoScanner('ao-vivo');
        } catch (erro) {
            definirEstadoScanner('erro', erro.message);
        }
    }

    function desligarCamera() {
        Camera.desligar(el.video);
        // Mantém a foto/resultado na tela; só volta a "desligada" se estava filmando
        if (['iniciando', 'ao-vivo'].includes(scanner.estado)) definirEstadoScanner('desligada');
    }

    async function aoCapturar() {
        if (scanner.estado !== 'ao-vivo') return;

        const meuToken = ++scanner.tokenAnalise;

        try {
            const base64 = Camera.capturarFrame(el.video, el.canvas);
            scanner.miniatura = Camera.gerarMiniatura(el.canvas);

            // Congela: mostra a foto capturada por cima e pausa o vídeo
            el.foto.src = base64;
            el.video.pause();
            definirEstadoScanner('analisando');

            const descricao = await analisarImagem(base64);
            if (meuToken !== scanner.tokenAnalise) return; // análise cancelada (usuário clicou em "Tirar outra")

            el.inputItem.value = descricao;
            definirEstadoScanner('resultado');
            el.inputItem.focus();
            el.inputItem.select();
        } catch (erro) {
            if (meuToken !== scanner.tokenAnalise) return;
            toast(`⚠️ Falha na análise: ${erro.message}`);

            // Em caso de falha ou timeout, restaura a exibição da câmera ao vivo
            el.foto.removeAttribute('src');
            definirEstadoScanner('ao-vivo');
            if (Camera.estaLigada()) {
                el.video.play().catch(() => {});
            }
        } finally {
            // Obrigatoriamente remove o aviso de 'Analisando imagem...' e libera o botão,
            // não importando o resultado (sucesso, falha ou timeout)
            el.analisando.hidden = true;
            el.btnCapturar.disabled = false;
        }
    }

    async function aoRefazer() {
        scanner.tokenAnalise++; // invalida qualquer análise pendente
        scanner.miniatura = null;
        el.inputItem.value = '';
        el.foto.removeAttribute('src');

        if (Camera.estaLigada()) {
            definirEstadoScanner('ao-vivo');
            try { await el.video.play(); } catch { /* reprodução retomada no próximo gesto */ }
        } else {
            await ligarCamera(); // a câmera foi desligada (troca de aba / app em segundo plano)
        }
    }

    function aoSalvarItem(e) {
        e.preventDefault();
        if (scanner.estado !== 'resultado') return;

        const { ambienteId, conteinerId } = Banco.obterSelecao();
        const ambiente = Banco.obterAmbiente(ambienteId);
        const conteiner = Banco.obterConteiner(ambienteId, conteinerId);
        if (!conteiner) {
            toast('⚠️ Selecione um Ambiente e um Contêiner.');
            el.selectAmbiente.focus();
            return;
        }

        const nome = el.inputItem.value;
        const salvo = tentar(
            () => Banco.adicionarItem(ambienteId, conteinerId, { nome, foto: scanner.miniatura }),
            `✅ "${nome.trim()}" salvo em ${ambiente.nome} › ${conteiner.nome}`
        );
        if (salvo) aoRefazer(); // pronto para o próximo item
    }

    /* ---------- Eventos: Meus Locais ---------- */
    async function aoClicarLista(e) {
        const botao = e.target.closest('[data-acao]');
        if (!botao) return;
        const { acao, ambiente: ambienteId, conteiner: conteinerId, item: itemId } = botao.dataset;
        const ambiente = Banco.obterAmbiente(ambienteId);

        switch (acao) {
            case 'alternar':
                ambientesAbertos.has(ambienteId) ? ambientesAbertos.delete(ambienteId) : ambientesAbertos.add(ambienteId);
                renderizarLocais();
                break;

            case 'renomear-ambiente': {
                const nome = await Modal.pedirTexto('Renomear ambiente', ambiente.nome);
                if (nome !== null) tentar(() => Banco.renomearAmbiente(ambienteId, nome), 'Ambiente renomeado.');
                break;
            }

            case 'remover-ambiente': {
                const total = ambiente.conteineres.length;
                const ok = await Modal.confirmar(
                    `Excluir "${ambiente.nome}"?`,
                    total ? `Isso também excluirá ${plural(total, 'contêiner', 'contêineres')} e todos os itens dentro deles.` : 'Esta ação não pode ser desfeita.'
                );
                if (ok) {
                    ambientesAbertos.delete(ambienteId);
                    tentar(() => Banco.removerAmbiente(ambienteId), 'Ambiente excluído.');
                }
                break;
            }

            case 'renomear-conteiner': {
                const conteiner = Banco.obterConteiner(ambienteId, conteinerId);
                const nome = await Modal.pedirTexto('Renomear contêiner', conteiner.nome);
                if (nome !== null) tentar(() => Banco.renomearConteiner(ambienteId, conteinerId, nome), 'Contêiner renomeado.');
                break;
            }

            case 'remover-conteiner': {
                const conteiner = Banco.obterConteiner(ambienteId, conteinerId);
                const ok = await Modal.confirmar(
                    `Excluir "${conteiner.nome}"?`,
                    conteiner.itens.length ? `${plural(conteiner.itens.length, 'item', 'itens')} dentro dele também será(ão) excluído(s).` : 'Esta ação não pode ser desfeita.'
                );
                if (ok) tentar(() => Banco.removerConteiner(ambienteId, conteinerId), 'Contêiner excluído.');
                break;
            }

            case 'remover-item': {
                const item = Banco.obterConteiner(ambienteId, conteinerId)?.itens.find((i) => i.id === itemId);
                if (!item) break;
                const ok = await Modal.confirmar(`Excluir "${item.nome}"?`, 'Esta ação não pode ser desfeita.');
                if (ok) tentar(() => Banco.removerItem(ambienteId, conteinerId, itemId), 'Item excluído.');
                break;
            }
        }
    }

    function aoSubmeterLista(e) {
        const form = e.target.closest('.form-conteiner');
        if (!form) return;
        e.preventDefault();
        const ambienteId = form.dataset.ambiente;
        const nome = form.elements.nome.value;
        const criado = tentar(() => Banco.criarConteiner(ambienteId, nome), 'Contêiner criado.');
        if (criado) {
            // Mantém o foco no campo para cadastro rápido de vários contêineres
            el.listaAmbientes.querySelector(`.form-conteiner[data-ambiente="${ambienteId}"] input`)?.focus();
        }
    }

    function aoCriarAmbiente(e) {
        e.preventDefault();
        const criado = tentar(() => Banco.criarAmbiente(el.inputAmbiente.value), 'Ambiente criado.');
        if (criado) {
            el.inputAmbiente.value = '';
            ambientesAbertos.add(criado.id); // abre o novo ambiente para já adicionar contêineres
            renderizarLocais();
        }
    }

    function aoMudarAmbiente() {
        Banco.definirSelecao(el.selectAmbiente.value, null);
        renderizarEscanear();
    }

    function aoMudarConteiner() {
        Banco.definirSelecao(el.selectAmbiente.value, el.selectConteiner.value);
        renderizarEscanear();
    }

    /** Libera a câmera quando o app vai para segundo plano e religa ao voltar. */
    function aoMudarVisibilidade() {
        if (document.hidden) {
            desligarCamera();
        } else if (telaAtiva() === 'tela-escanear' && ['desligada', 'erro'].includes(scanner.estado)) {
            ligarCamera();
        }
    }

    function iniciar() {
        el.tabs.forEach((tab) => tab.addEventListener('click', () => mostrarTela(tab.dataset.tela)));
        el.formAmbiente.addEventListener('submit', aoCriarAmbiente);
        el.listaAmbientes.addEventListener('click', aoClicarLista);
        el.listaAmbientes.addEventListener('submit', aoSubmeterLista);
        el.selectAmbiente.addEventListener('change', aoMudarAmbiente);
        el.selectConteiner.addEventListener('change', aoMudarConteiner);

        // Câmera
        el.btnCapturar.addEventListener('click', aoCapturar);
        el.btnCameraLigar.addEventListener('click', ligarCamera);
        el.btnRefazer.addEventListener('click', aoRefazer);
        el.painelResultado.addEventListener('submit', aoSalvarItem);
        document.addEventListener('visibilitychange', aoMudarVisibilidade);
        window.addEventListener('pagehide', () => Camera.desligar(el.video));

        // Sincroniza se os dados forem alterados em outra aba do navegador
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith('armarioDigital:')) location.reload();
        });

        definirEstadoScanner('desligada', 'A câmera será ativada ao abrir esta aba.');
        renderizarTudo();
    }

    return { iniciar };
})();

document.addEventListener('DOMContentLoaded', UI.iniciar);