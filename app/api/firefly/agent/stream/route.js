import { runFireflyAgentTask } from '@/services/fireflyAgentService';

function buildStreamEvent(encoder, payload) {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request) {
    const body = await request.json().catch(() => ({}));

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
        async start(controller) {
            const send = (payload) => {
                controller.enqueue(buildStreamEvent(encoder, payload));
            };

            try {
                const result = await runFireflyAgentTask({
                    question: String(body.question || '').trim(),
                    threadKey: String(body.threadKey || 'default').trim(),
                    capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : [],
                    contextSnapshot: body.contextSnapshot || {},
                    uid: String(body.uid || request.headers.get('x-campus-user-uid') || '').trim(),
                    fid: String(body.fid || request.headers.get('x-campus-fid') || '').trim(),
                    onEvent: send,
                });

                send({
                    type: 'done',
                    handled: Boolean(result?.handled),
                    task: result?.task || null,
                    reply: result?.reply || '',
                    plan: result?.plan || null,
                });
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch (error) {
                send({
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Failed to run Firefly agent task.',
                });
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } finally {
                controller.close();
            }
        },
    });

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
