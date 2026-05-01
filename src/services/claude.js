import Anthropic from '@anthropic-ai/sdk';
import { ROADMAP_OFFER_INSTRUCTION } from '../utils/offer.js';
import { VISION_SESSION_INSTRUCTION } from '../utils/vision.js';

export const MODEL = 'claude-sonnet-4-5';

export const SYSTEM_PROMPT =
  "You are Guided, an AI companion that helps users learn software by working through their own projects. Be concise, encouraging, and practical. Always relate your advice to what the user is actually trying to build. Never use markdown formatting in your responses — no # headers, no **bold**, no bullet points with dashes. Write in plain conversational prose, like you're talking to someone, not writing a document. Never ask more than one question in a single message. Ask the most important question first, then ask follow-ups in subsequent messages once the user has answered. Whenever you explain a new term, tool, or technique that the user may want to remember, append it to your message in this format on a new line BEFORE the CHIPS line: CONCEPT:{\"term\":\"Layer Mask\",\"definition\":\"A layer mask lets you hide or reveal parts of a layer without permanently erasing anything. Think of it as a stencil attached to your layer — black hides, white reveals.\"} Only add one concept per message, only for genuinely new terms worth remembering, and keep definitions conversational and jargon-free. When guiding the user to click something specific you can see on their screen (typically right after they've shared a screenshot), append POINTER on a new line BEFORE the CHIPS line in this format: POINTER:{\"x\":0.65,\"y\":0.32,\"label\":\"Click here\"} — using normalized x/y coordinates (0 to 1) of the target element. Only use POINTER when you can confidently identify a specific UI element on the user's screen. When a visual reference would help the user, append SEARCH_IMAGE on a new line BEFORE the CHIPS line in this format: SEARCH_IMAGE:{\"query\":\"vintage coffee shop logo examples\"} — using a specific search query. Use this sparingly, only when seeing examples is genuinely useful. At the very end of every response, on its own new line, append three short follow-up suggestions in this exact format: CHIPS:[\"option 1\",\"option 2\",\"option 3\"]. Use CHIPS_MULTI:[\"option 1\",\"option 2\"] (same JSON shape, different token) when the question has multiple valid answers — for example 'which tools do you use?' or 'what are you interested in learning?' — where the user might want to pick several. Use regular CHIPS for single-answer questions like 'are you a beginner or experienced?' or for general follow-ups. Chips should always be short responses IN THE USER'S VOICE — things the user might plausibly want to say back, not suggestions or ideas you're offering them. Never put specific names, titles, or creative suggestions in chips. For example if you ask 'what is your shop called?' the chips should be things like 'I have a name already', 'I need help choosing a name', 'not sure yet' — not actual name suggestions. After asking what the user wants to work on first, always suggest relevant chips based on their project and current roadmap phase. Each chip should be under 8 words. Use valid JSON. Don't introduce or label the line — just output it.";

export const ENV_API_KEY = import.meta.env.ANTHROPIC_API_KEY || '';
export const BACKEND_URL = import.meta.env.BACKEND_URL || 'http://localhost:3001';

function buildSystemBlocks({
  projectDescription,
  activeApp,
  roadmapOfferEnabled,
  visionActive,
  activePhase,
}) {
  const system = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  ];
  const ctx = (projectDescription ?? '').trim();
  if (ctx) {
    system.push({ type: 'text', text: `Project context: ${ctx}` });
  }
  const appName = (activeApp ?? '').trim();
  if (appName) {
    system.push({ type: 'text', text: `The user currently has ${appName} open.` });
  }
  if (roadmapOfferEnabled) {
    system.push({ type: 'text', text: ROADMAP_OFFER_INSTRUCTION });
  }
  if (visionActive) {
    system.push({ type: 'text', text: VISION_SESSION_INSTRUCTION });
  }
  if (activePhase && activePhase.title) {
    const stepsList = (activePhase.steps ?? [])
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');
    const phaseBlock = [
      `Active roadmap phase: "${activePhase.title}"`,
      activePhase.description ? activePhase.description : '',
      stepsList ? `Steps in this phase:\n${stepsList}` : '',
      '',
      "When you feel the user has completed or has a solid grasp of the skills covered in their current active roadmap phase, end your message with PHASE_COMPLETE_NUDGE on a new line. Only do this when it genuinely feels like they've mastered that phase — don't rush it.",
    ]
      .filter(Boolean)
      .join('\n');
    system.push({ type: 'text', text: phaseBlock });
  }
  return system;
}

export async function streamChat({
  mode = 'byok',
  apiKey,
  sessionToken,
  messages,
  projectDescription,
  activeApp,
  roadmapOfferEnabled,
  visionActive,
  activePhase,
  onDelta,
  signal,
}) {
  const system = buildSystemBlocks({
    projectDescription,
    activeApp,
    roadmapOfferEnabled,
    visionActive,
    activePhase,
  });

  if (mode === 'subscription') {
    return streamViaBackend({
      sessionToken,
      system,
      messages,
      max_tokens: 4096,
      onDelta,
      signal,
    });
  }

  if (!apiKey) {
    throw new Error('No API key. Add one in Settings or to .env, then retry.');
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 4096,
      system,
      messages,
    },
    { signal }
  );

  stream.on('text', (delta) => {
    onDelta(delta);
  });

  return stream.finalMessage();
}

async function streamViaBackend({ sessionToken, system, messages, max_tokens, onDelta, signal }) {
  if (!sessionToken) {
    throw new Error('Not signed in. Sign in to continue.');
  }

  const response = await fetch(`${BACKEND_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: sessionToken,
      messages,
      system,
      max_tokens: max_tokens ?? 4096,
      model: MODEL,
    }),
    signal,
  });

  if (!response.ok) {
    let detail;
    try {
      detail = await response.json();
    } catch {}
    const error = new Error(detail?.error || `Backend error (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response stream from backend.');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let streamError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const parsed = parseSseChunk(chunk);
      if (!parsed) continue;
      const { event, data } = parsed;
      if (event === 'delta' && typeof data?.text === 'string') {
        onDelta(data.text);
      } else if (event === 'done') {
        return;
      } else if (event === 'error') {
        streamError = new Error(data?.message || 'Stream error');
      }
    }
  }

  if (streamError) throw streamError;
}

function parseSseChunk(chunk) {
  if (!chunk) return null;
  let event = 'message';
  let dataStr = '';
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataStr += line.slice(6);
  }
  let data = null;
  if (dataStr) {
    try {
      data = JSON.parse(dataStr);
    } catch {
      data = null;
    }
  }
  return { event, data };
}

export async function generateRoadmap({ apiKey, projectName, projectDescription, conversation }) {
  if (!apiKey) throw new Error('No API key.');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const transcript = (conversation ?? [])
    .filter((m) => m && m.text && !m.streaming && !m.error)
    .map((m) => `${m.role === 'user' ? 'User' : 'Guided'}: ${m.text}`)
    .join('\n');

  const userPrompt = [
    'Generate a learning roadmap for this software project, returned as JSON only.',
    '',
    `Project name: ${projectName}`,
    projectDescription ? `Initial instructions: ${projectDescription}` : '',
    transcript ? `\nRecent conversation between the user and Guided:\n${transcript}\n` : '',
    'Create 4 to 6 phases tailored to this project. Use what the user has shared in conversation to make the phases specific and personal — reference their actual goals, level, and constraints rather than generic advice. Each phase has:',
    '- id: integer starting at 1',
    '- title: short phase name (under 6 words)',
    '- description: one sentence explaining what this phase is about',
    '- steps: 3 to 5 short bullet points (each under 12 words) of concrete tasks in this phase',
    '- status: always "todo"',
    '',
    'Output exactly this shape:',
    '{"phases":[{"id":1,"title":"...","description":"...","steps":["..."],"status":"todo"}]}',
    '',
    'Output the JSON object only. No markdown fences, no preamble, no commentary.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      'You generate structured learning roadmaps for software projects. Output valid JSON only — no markdown, no commentary, no preamble.',
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in roadmap response.');

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('Invalid JSON in roadmap response.');
  }

  if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
    throw new Error('Roadmap has no phases.');
  }

  const phases = parsed.phases.map((p, i) => ({
    id: typeof p.id === 'number' ? p.id : i + 1,
    title: String(p.title ?? '').trim() || `Phase ${i + 1}`,
    description: String(p.description ?? '').trim(),
    steps: Array.isArray(p.steps)
      ? p.steps.map((s) => String(s).trim()).filter(Boolean)
      : [],
    status: i === 0 ? 'active' : 'todo',
  }));

  return { phases };
}
