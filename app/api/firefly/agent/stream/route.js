import { runFireflyAgentTask } from '@/services/fireflyAgentService';
import { decideFireflyResponseMode } from '@/lib/fireflyResponseMode';

function buildStreamEvent(encoder, payload) {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function splitReplyIntoStreamChunks(reply = '') {
    const text = String(reply || '').trim();
    if (!text) {
        return [];
    }

    const paragraphs = text
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter(Boolean);

    if (paragraphs.length <= 1) {
        const chunks = [];
        for (let index = 0; index < text.length; index += 120) {
            chunks.push(text.slice(index, index + 120));
        }
        return chunks;
    }

    return paragraphs.map((item, index) => (
        index < paragraphs.length - 1 ? `${item}\n\n` : item
    ));
}

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const question = String(body.question || '').trim();
    const threadKey = String(body.threadKey || 'default').trim();
    const contextSnapshot = body.contextSnapshot || {};
    const responseMode = decideFireflyResponseMode({
        question,
        webSearchEnabled: Boolean(contextSnapshot?.webSearchEnabled),
        deepResearchEnabled: Boolean(contextSnapshot?.deepResearchEnabled),
        runtimeContext: contextSnapshot,
        hasRuntimeRecovery: Boolean(contextSnapshot?.resumeMode),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
        async start(controller) {
            const send = (payload) => {
                controller.enqueue(buildStreamEvent(encoder, payload));
            };

            try {
                if (!['agent', 'workspace'].includes(responseMode.id)) {
                    send({
                        type: 'unhandled',
                        handled: false,
                        responseMode,
                        reason: 'response_mode_not_agent',
                    });
                    send({
                        type: 'done',
                        handled: false,
                        responseMode,
                        reply: '',
                        plan: null,
                    });
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    return;
                }

                const result = await runFireflyAgentTask({
                    question,
                    threadKey,
                    capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : [],
                    contextSnapshot,
                    uid: String(body.uid || request.headers.get('x-campus-user-uid') || '').trim(),
                    fid: String(body.fid || request.headers.get('x-campus-fid') || '').trim(),
                    onEvent: send,
                });

                if (result?.handled && result?.reply) {
                    send({
                        type: 'reply_started',
                        task: result?.task || null,
                    });

                    for (const chunk of splitReplyIntoStreamChunks(result.reply)) {
                        send({
                            type: 'reply_delta',
                            content: chunk,
                        });
                    }

                    send({
                        type: 'reply_completed',
                    });
                }

                send({
                    type: 'done',
                    handled: Boolean(result?.handled),
                    responseMode,
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
