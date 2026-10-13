import { z } from 'zod';

export const ResumoSchema = z.object({
  itens: z.array(z.object({
    nome: z.string().describe('Nome da startup ou do projeto'),
    responsavel: z.string().nullable().describe('Fundador(es), CEO ou coordenador; null se não encontrado'),
    area: z.string().nullable().describe('Área de atuação / setor'),
    website: z.string().nullable().describe('Site oficial da startup/projeto'),
    resumo: z.string().describe('Uma ou duas frases sobre o que a startup/projeto faz'),
    fonte: z.string().describe('URL onde a informação foi encontrada'),
  })),
});

export const INSTRUCOES = `Você ajuda a mapear startups e projetos de inovação a partir de resultados de busca.
Para cada startup ou projeto citado nas fontes, extraia: nome, responsável (fundador, CEO ou coordenador), área de atuação, website oficial, um resumo de uma ou duas frases e a URL de onde tirou a informação.
Nunca invente dados: se uma informação não aparecer nas fontes, use null.
Ignore resultados que não citem uma startup ou projeto específico (listas genéricas, vagas, notícias sem nome de empresa). Não repita a mesma startup.
Escreva em português.`;

export function descreverResultados(consulta, resultados) {
  const lista = resultados
    .map((r, i) => `${i + 1}. ${r.titulo}\n   ${r.link}\n   ${r.trecho}`)
    .join('\n\n');
  return `Consulta feita no buscador: ${consulta}\n\nResultados:\n\n${lista}`;
}
