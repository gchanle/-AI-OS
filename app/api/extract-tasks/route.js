import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { text, sessionId } = await request.json();
        const extractionModelId = process.env.FIREFLY_TASK_EXTRACTION_MODEL || 'firefly-coder-demo';

        if (!text) {
            return NextResponse.json({ tasks: [] });
        }

        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing API key' }, { status: 500 });
        }

        const systemPrompt = `You are a strict task extraction assistant. 
Your ONLY job is to extract explicit, long-term, or multi-step tasks that the user commands you (the AI assistant) to help with or work on together. 
CRITICAL RULE: Ignore trivial, immediate, or single-turn tasks (e.g., "check the weather", "what is 1+1", "translate this word", "search for X"). Only extract tasks that realistically require continuous effort, time, or multiple steps to complete (e.g., "write a paper", "plan a 3-day study schedule", "develop a new feature").
Additionally, DO NOT extract the user's personal study records, past actions, or general statements as tasks. 

For example:
- "Help me create a study plan" -> extract: {"title": "制定学习计划"}
- "Check the weather tomorrow" -> extract NOTHING
- "I studied math today" -> extract NOTHING

Return ONLY a valid JSON array of objects. Do not include markdown formatting or surrounding text.
Each object must exactly match this format:
- "id": a unique string (e.g. "task-1")
- "title": string, a short descriptive title of the task
- "status": string, always "pending"
- "progress": number, always 0

If there are no explicit commands for you to perform, return an empty array [].`;

        const response = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: extractionModelId,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('DashScope extraction error:', errText);
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        
        let tasks = [];
        try {
            tasks = JSON.parse(content);
            if (!Array.isArray(tasks)) {
                tasks = tasks.tasks || [];
            }
            if (sessionId) {
                tasks = tasks.map(t => ({ ...t, sessionId }));
            }
        } catch (e) {
            console.warn("Could not parse JSON from model:", content);
        }

        return NextResponse.json({ tasks });

    } catch (error) {
        console.error('Error in /api/extract-tasks:', error);
        return NextResponse.json({ error: 'Extraction failed', tasks: [] }, { status: 500 });
    }
}
