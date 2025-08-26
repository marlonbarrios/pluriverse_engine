export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fal } from '@fal-ai/client';

function jsonLine(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

fal.config({ credentials: process.env.FAL_KEY || '' });

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const doStream = searchParams.get('stream') === '1';
    const body = await req.json();
    const model = String(body?.model || 'fal-ai/any-llm');
    const system = typeof body?.system === 'string' ? body.system : '';
    const user = typeof body?.input === 'string' ? body.input : '';

    if (!process.env.FAL_KEY) {
      return new Response(JSON.stringify({ error: 'Missing FAL_KEY server env' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!user) {
      return new Response(JSON.stringify({ error: 'Missing input prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!doStream) {
      try {
        const result = await fal.subscribe('fal-ai/any-llm', {
          input: { prompt: user, system_prompt: system, model, priority: 'latency' },
          logs: false,
        });
      const out = (result as any)?.data?.output || '';
      try {
        const parsed = JSON.parse(out);
        if (parsed && (parsed.title || parsed.prompt)) {
          return new Response(
            JSON.stringify({ title: parsed.title || '', prompt: parsed.prompt || '' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch {}
      return new Response(
        JSON.stringify({ title: '', prompt: out }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      } catch (e: any) {
        const msg = e?.message || 'subscribe_error';
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const encoder = new TextEncoder();
    const streamResp = new ReadableStream<Uint8Array>({
      async start(controller) {
        let prev = '';
        try {
          const stream = await fal.stream('fal-ai/any-llm', {
            input: { prompt: user, system_prompt: system, model, priority: 'latency' },
          });

          for await (const event of stream as any) {
            // Only forward true deltas (plain text), avoid streaming JSON output
            if (typeof event?.delta?.content === 'string') {
              let delta = event.delta.content;
              if (/^```/.test(delta) || /^\{/.test(delta) || /^\[/.test(delta)) delta = '';
              prev += delta;
              if (delta) controller.enqueue(encoder.encode(jsonLine({ prompt_delta: delta })));
              continue;
            }
            if (typeof event?.delta?.output === 'string') {
              let delta = event.delta.output;
              if (/^```/.test(delta) || /^\{/.test(delta) || /^\[/.test(delta)) delta = '';
              prev += delta;
              if (delta) controller.enqueue(encoder.encode(jsonLine({ prompt_delta: delta })));
              continue;
            }
            // ignore other event shapes to prevent leaking raw JSON
          }

          const done = await stream.done();
          const finalOut = (done as any)?.data?.output || prev || (done as any)?.output || '';
          let title = '';
          let prompt = finalOut || '';
          try {
            const parsed = JSON.parse(finalOut);
            if (parsed && (parsed.title || parsed.prompt)) {
              title = parsed.title || '';
              prompt = parsed.prompt || '';
            }
          } catch {}
          controller.enqueue(encoder.encode(jsonLine({ title, prompt })));
        } catch (err: any) {
          controller.enqueue(encoder.encode(jsonLine({ error: err?.message || 'stream_error' })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(streamResp, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}


