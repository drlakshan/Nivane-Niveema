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

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'about', 'from',
  'what', 'is', 'are', 'was', 'were', 'does', 'do', 'did', 'can', 'could', 'would', 'should',
  'please', 'describe', 'explain', 'tell', 'me', 'this', 'that', 'these', 'those', 'how'
]);

const EXPANSIONS: Record<string, string[]> = {
  consciousness: ['consciousness', 'viññāṇa', 'vinnana', 'viññana', 'mind-consciousness'],
  nibbana: ['nibbāna', 'nibbana'],
  namarupa: ['name-and-form', 'nāmarūpa', 'nama-rupa', 'nāma-rūpa'],
  sankhara: ['saṅkhāra', 'sankhara', 'preparations', 'formations'],
  hindrances: ['hindrance', 'hindrances', 'nīvaraṇa', 'nivarana', 'sensual desire', 'ill will', 'sloth', 'torpor', 'restlessness', 'worry', 'doubt'],
  hindrance: ['hindrance', 'hindrances', 'nīvaraṇa', 'nivarana', 'sensual desire', 'ill will', 'sloth', 'torpor', 'restlessness', 'worry', 'doubt'],
};

function normalizeWord(word: string) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, '');
}

function expandedTerms(query: string) {
  const raw = query.split(/\s+/).map(normalizeWord).filter(Boolean);
  const terms = new Set<string>();
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue;
    terms.add(word);
    for (const [key, values] of Object.entries(EXPANSIONS)) {
      if (word === key || values.includes(word)) {
        values.forEach((v) => terms.add(v.toLowerCase()));
      }
    }
  }
  return [...terms];
}

function paragraphNumber(id: string) {
  const match = id.match(/-p(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function scorePassage(text: string, query: string) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const terms = expandedTerms(query);
  let score = lowerText.includes(lowerQuery) ? 12 : 0;
  for (const term of terms) {
    if (lowerText.includes(term)) score += term.length > 6 ? 4 : 3;
  }
  return score;
}

function citationLabel(p: Passage) {
  const match = p.id.match(/-p(\d+)$/);
  const paragraph = match ? `¶${parseInt(match[1], 10)}` : p.id;
  return `${p.title}${p.sermon_number ? ` (Sermon ${p.sermon_number})` : ''}, ${paragraph}`;
}

function looksLikeInsufficientAnswer(answer: string) {
  const lower = answer.toLowerCase();
  return lower.includes('insufficient evidence') || lower.includes('not explicitly mentioned') || lower.includes('do not specifically mention');
}

function buildExtractiveFallback(question: string, citations: Passage[]) {
  const top = citations.slice(0, 3);
  const bullets = top.map((p) => `- ${citationLabel(p)}: ${p.text.slice(0, 260)}${p.text.length > 260 ? '…' : ''}`);
  return `I found relevant passages for “${question}”. Here are the strongest matches:\n\n${bullets.join('\n')}\n\nThese passages are likely more useful than saying the topic is absent.`;
}

async function loadPassages(request: Request, env: Env): Promise<Passage[]> {
  const url = new URL('/data/passages.json', request.url);
  const res = await env.ASSETS.fetch(url);
  if (!res.ok) throw new Error('Could not load passages.json');
  return await res.json<Passage[]>();
}

function expandContext(passages: Passage[], seedCitations: Passage[]) {
  const bySlug = new Map<string, Passage[]>();
  for (const passage of passages) {
    const list = bySlug.get(passage.slug) || [];
    list.push(passage);
    bySlug.set(passage.slug, list);
  }

  for (const list of bySlug.values()) {
    list.sort((a, b) => (paragraphNumber(a.id) ?? 0) - (paragraphNumber(b.id) ?? 0));
  }

  const selected = new Map<string, Passage>();
  for (const seed of seedCitations) {
    const list = bySlug.get(seed.slug) || [];
    const pNum = paragraphNumber(seed.id);
    for (const item of list) {
      const itemNum = paragraphNumber(item.id);
      if (itemNum !== null && pNum !== null && Math.abs(itemNum - pNum) <= 1) {
        selected.set(item.id, item);
      }
    }
  }

  return [...selected.values()].slice(0, 12);
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

  const prompt = `Answer only from the provided passages. Be concise but informative. If the user asks for a concept, explain it using the retrieved passages rather than saying it is absent unless the passages truly do not discuss it. If a numbered set is requested, list the items only if the passages support them. Quote briefly when helpful. Prefer synthesis over refusal when relevant evidence exists. If evidence is insufficient, say so explicitly. End with a short citation line using the provided labels.\n\nQuestion: ${question}\n\nPassages:\n${context}`;

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
    const seedCitations = passages
      .map((p) => ({ ...p, score: scorePassage(p.text, question) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (!seedCitations.length) {
      return json({
        answer: 'No relevant passage was found for that question.',
        citations: [],
      });
    }

    const citations = expandContext(passages, seedCitations);
    let answer = await askModel(question, citations, context.env);
    if (looksLikeInsufficientAnswer(answer) && citations.length) {
      answer = buildExtractiveFallback(question, citations);
    }

    return json({
      answer,
      citations: citations.map((rest) => ({
        ...rest,
        label: citationLabel(rest),
      })),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
};
