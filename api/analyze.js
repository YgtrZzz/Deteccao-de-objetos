/**
 * Vercel Serverless Function — Análise de Imagem com Google Gemini
 * -----------------------------------------------------------------
 * Rota: POST /api/analyze
 * Body esperado: { image: "data:image/jpeg;base64,..." } ou { base64: "..." }
 * Resposta: { objeto: "Livro Vermelho" }
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

        // 4. Parâmetros da API do Gemini
        // Modelo solicitado: gemini-1.5-flash (com suporte a override via GEMINI_MODEL)
        const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const prompt = 'Identifique o objeto principal nesta imagem de forma curta e direta, em português, com no máximo 3 palavras. Não use pontuação final.';

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

        // 5. Requisição HTTP nativa (fetch) para a API oficial do Google Gemini
        const geminiResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // 6. Tratamento de respostas de erro da API do Gemini
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json().catch(() => null);
            const mensagem = errorBody?.error?.message || `Erro ${geminiResponse.status} na API do Gemini`;
            console.error('[api/analyze] Erro da API Gemini:', errorBody || geminiResponse.statusText);
            return res.status(geminiResponse.status).json({
                error: mensagem
            });
        }

        // 7. Extração do texto identificado
        const data = await geminiResponse.json();
        const textoCandidato = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoCandidato) {
            return res.status(502).json({
                error: 'A IA não retornou uma resposta textual válida para a imagem fornecida.'
            });
        }

        // Limpeza: remove quebras de linha e qualquer pontuação final indesejada
        const objetoIdentificado = textoCandidato
            .trim()
            .replace(/[\r\n]+/g, ' ')
            .replace(/[.\s]+$/, '');

        // 8. Resposta de sucesso em JSON
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
