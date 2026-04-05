export interface Env {
  AI_GATEWAY_URL?: string;
  AI_GATEWAY_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ ok: true, message: 'Worker live. Use POST for ask endpoint.' });
    }

    const body = await request.json().catch(() => ({}));
    const question = typeof body.question === 'string' ? body.question : '';

    return Response.json({
      ok: true,
      question,
      answer: 'Placeholder response. Retrieval and model call will be added next.',
      citations: [],
    });
  },
};
