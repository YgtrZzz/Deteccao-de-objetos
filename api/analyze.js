/**
 * Vercel Serverless Function — Análise de Imagem com Google Gemini
 * -----------------------------------------------------------------
 * Rota: POST /api/analyze
 * Body esperado: { image: "data:image/jpeg;base64,..." } ou { base64: "..." }
 * Resposta: { objeto: "Caneca Azul" }
 */

export default async function handler(req, res) {
    // 1. Validação do método HTTP (aceita apenas POST)
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({
            error: 'Método não permitido. Utilize POST.'
        });
    }

    // 2. Validação da variável de ambiente GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: 'Variável de ambiente GEMINI_API_KEY não configurada no servidor.'
        });
    }

    try {
        // 3. Extração e validação do corpo da requisição
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch {
                return res.status(400).json({
                    error: 'Corpo da requisição deve ser um JSON válido.'
                });
            }
        }

        const rawImage = body?.image || body?.base64;
        if (!rawImage || typeof rawImage !== 'string') {
            return res.status(400).json({
                error: 'Imagem em base64 não fornecida. Envie o campo "image" ou "base64".'
            });
        }

        // Separa o tipo MIME e os dados puros em base64 (remove prefixo "data:image/...;base64,")
        let mimeType = 'image/jpeg';
        let base64Data = rawImage;
        const match = rawImage.match(/^data:([a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
        if (match) {
            mimeType = match[1];
            base64Data = match[2];
        }

        // 4. Definição do prompt
        const prompt = 'Identifique o objeto principal nesta imagem de forma curta e direta, em português, com no máximo 3 palavras. Não use pontuação final.';

        const payload = {
            contents: [
                {
                    parts: [
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        },
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 40
            }
        };

        // 5. Estratégia de Endpoints com Fallback Automático:
        // O erro "models/gemini-1.5-flash is not found for API version v1beta" ocorre
        // porque na API v1beta o alias correto é gemini-1.5-flash-latest, enquanto
        // na API v1 (GA estável) o modelo é registrado como gemini-1.5-flash.
        // Testamos os candidatos em ordem; se retornar 404 (not found), avança para o próximo.
        const modeloCustomizado = process.env.GEMINI_MODEL;
        const versaoCustomizada = process.env.GEMINI_API_VERSION;

        const tentativas = modeloCustomizado
            ? [
                { versao: versaoCustomizada || 'v1', modelo: modeloCustomizado },
                { versao: 'v1beta', modelo: modeloCustomizado }
              ]
            : [
                // 1º: v1 estável (GA) com gemini-1.5-flash
                { versao: 'v1', modelo: 'gemini-1.5-flash' },
                // 2º: v1beta com o alias gemini-1.5-flash-latest
                { versao: 'v1beta', modelo: 'gemini-1.5-flash-latest' },
                // 3º: v1 com o alias gemini-1.5-flash-latest
                { versao: 'v1', modelo: 'gemini-1.5-flash-latest' },
                // 4º: Fallback de segurança para modelos Flash mais recentes caso a conta/região
                // já tenha migrado além da família 1.5
                { versao: 'v1beta', modelo: 'gemini-2.5-flash' },
                { versao: 'v1beta', modelo: 'gemini-3.8-flash' }
              ];

        let dadosResposta = null;
        let ultimoErro = null;

        for (const { versao, modelo } of tentativas) {
            const endpoint = `https://generativelanguage.googleapis.com/${versao}/models/${modelo}:generateContent?key=${apiKey}`;

            const geminiResponse = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (geminiResponse.ok) {
                dadosResposta = await geminiResponse.json();
                console.log(`[api/analyze] Sucesso usando ${versao}/models/${modelo}`);
                break;
            }

            const errorBody = await geminiResponse.json().catch(() => null);
            ultimoErro = errorBody?.error?.message || `Erro ${geminiResponse.status} na API do Gemini`;

            // Erros de autenticação (401/403) ou requisição inválida (400) não devem continuar no loop
            if (geminiResponse.status !== 404) {
                console.error(`[api/analyze] Erro definitivo da API Gemini (${geminiResponse.status}):`, ultimoErro);
                return res.status(geminiResponse.status).json({ error: ultimoErro });
            }

            console.warn(`[api/analyze] ${versao}/models/${modelo} retornou 404. Tentando próximo candidato...`);
        }

        if (!dadosResposta) {
            return res.status(404).json({
                error: ultimoErro || 'Nenhum dos modelos Flash testados foi encontrado para esta chave na API do Gemini.'
            });
        }

        // 6. Extração e sanitização do texto identificado
        const textoCandidato = dadosResposta?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoCandidato) {
            return res.status(502).json({
                error: 'A IA não retornou uma resposta textual válida para a imagem fornecida.'
            });
        }

        // Limpeza: remove quebras de linha e pontuações finais
        const objetoIdentificado = textoCandidato
            .trim()
            .replace(/[\r\n]+/g, ' ')
            .replace(/[.\s]+$/, '');

        // 7. Retorno formatado em JSON
        return res.status(200).json({
            objeto: objetoIdentificado,
            nome: objetoIdentificado
        });

    } catch (erro) {
        console.error('[api/analyze] Erro interno:', erro);
        return res.status(500).json({
            error: erro.message || 'Erro interno ao processar a análise da imagem.'
        });
    }
}
