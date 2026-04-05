interface Env {
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
}

interface Passage {
  id: string;
  slug: string;
  title: string;
  sermon_number: number | null;
  url: string;
  text: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function scorePassage(text: string, query: string) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(Boolean);
  let score = lowerText.includes(lowerQuery) ? 8 : 0;
  for (const term of terms) {
    if (lowerText.includes(term)) score += 2;
  }
  return score;
}

function citationLabel(p: Passage) {
  const match = p.id.match(/-p(\d+)$/);
  const paragraph = match ? `¶${parseInt(match[1], 10)}` : p.id;
  return `${p.title}${p.sermon_number ? ` (Sermon ${p.sermon_number})` : ''}, ${paragraph}`;
}

async function loadPassages(request: Request, env: Env): Promise<Passage[]> {
  const url = new URL('/data/passages.json', request.url);
  const res = await env.ASSETS.fetch(url);
  if (!res.ok) throw new Error('Could not load passages.json');
  return await res.json<Passage[]>();
}

async function askModel(question: string, citations: Passage[], env: Env) {
  if (!env.OPENAI_API_KEY) {
    return `Top matching passages are shown below. Configure OPENAI_API_KEY to enable synthesized answers.`;
  }

  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const context = citations
    .map((p, i) => `[${i + 1}] ${citationLabel(p)}\n${p.text}`)
    .join('\n\n');

  const prompt = `Answer only from the provided passages. Be concise. Quote briefly when helpful. If evidence is insufficient, say so. End with a short citation line using the provided labels.\n\nQuestion: ${question}\n\nPassages:\n${context}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a careful text-grounded assistant for a sermon corpus.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Model call failed: ${text}`);
  }

  const data = await res.json<any>();
  return data.choices?.[0]?.message?.content || 'No answer returned.';
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<any>().catch(() => ({}));
    const question = typeof body.question === 'string' ? body.question.trim() : '';

    if (!question) return json({ error: 'Question is required.' }, 400);

    const passages = await loadPassages(context.request, context.env);
    const citations = passages
      .map((p) => ({ ...p, score: scorePassage(p.text, question) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!citations.length) {
      return json({
        answer: 'No relevant passage was found for that question.',
        citations: [],
      });
    }

    const answer = await askModel(question, citations, context.env);

    return json({
      answer,
      citations: citations.map(({ score, ...rest }) => ({
        ...rest,
        label: citationLabel(rest),
      })),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
};
