import { useEffect, useRef, useState } from 'react';
import { streamChat } from '../services/claude.js';
import { splitChips } from '../utils/chips.js';
import { shouldCapture } from '../utils/triggers.js';
import {
  parseOffer,
  ROADMAP_ACCEPT_ACK,
  ROADMAP_DECLINE_RESPONSE,
  ROADMAP_OFFER_ACCEPT_LABEL,
  ROADMAP_OFFER_DECLINE_LABEL,
} from '../utils/offer.js';
import {
  splitNudge,
  NUDGE_PROMPT_TEXT,
  NUDGE_COMPLETE_LABEL,
  NUDGE_DISMISS_LABEL,
  PHASE_COMPLETE_CONFIRMATION,
} from '../utils/nudge.js';
import { parseConcept } from '../utils/concept.js';
import { parsePointer } from '../utils/pointer.js';
import { parseSearchImage } from '../utils/searchImage.js';
import { parseBuildRoadmap } from '../utils/vision.js';
import { classifyError, ERROR_MESSAGES } from '../utils/errors.js';
import { linkify, resolveLinkUrl } from '../utils/linkify.js';

const VISION_KICKOFF_TEXT = '__VISION_START__';

const IMAGE_ONLY_DEFAULT_PROMPT =
  'What can you tell me about this image? How does it relate to my project?';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ROADMAP_START_FOLLOWUP =
  "Great — let's dive in. What would you like to work on first?";

function clipChip(text, max = 36) {
  const t = String(text ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + '…';
}

function buildRoadmapStartChips(firstPhase) {
  const chips = [];
  if (firstPhase?.title) {
    chips.push(clipChip(`Walk me through ${firstPhase.title}`));
  }
  const firstStep = firstPhase?.steps?.[0];
  if (firstStep) {
    chips.push(clipChip(`Tell me about: ${firstStep}`));
  } else {
    chips.push('Show me what to do first');
  }
  chips.push("I'm ready to start");
  chips.push('Give me an overview');
  return chips.slice(0, 4);
}

export default function ChatTab({
  apiKey,
  chatMode = 'byok',
  getSessionToken,
  project,
  activeApp,
  onUpdate,
  onAcceptRoadmapOffer,
  onMarkPhaseComplete,
  onConceptDetected,
  onPointerFired,
  onSearchResults,
  onTriggerVisionRoadmap,
  onBack,
  onOpenProjects,
  onOpenSettings,
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [chipSelections, setChipSelections] = useState({});
  const [attachedImage, setAttachedImage] = useState(null);
  const [attachError, setAttachError] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef(null);
  const flashTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const conceptDetectedRef = useRef(onConceptDetected);
  const pointerFiredRef = useRef(onPointerFired);
  const searchResultsRef = useRef(onSearchResults);
  const inFlightSearchesRef = useRef(new Set());
  const visionStartedRef = useRef(new Set());

  const messages = project?.messages ?? [];

  useEffect(() => {
    conceptDetectedRef.current = onConceptDetected;
    pointerFiredRef.current = onPointerFired;
    searchResultsRef.current = onSearchResults;
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, project?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(dist > 80);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setAttachedImage(null);
    setAttachError('');
  }, [project?.id]);

  // Scan finalized assistant messages for CONCEPT tokens and auto-save.
  useEffect(() => {
    if (!project) return;
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.streaming || m.error || m.conceptSaved) continue;
      const { concept } = parseConcept(m.text);
      if (concept) {
        conceptDetectedRef.current?.(m.id, concept);
      }
    }
  }, [messages, project?.id]);

  // Scan finalized assistant messages for POINTER tokens and trigger the overlay once.
  useEffect(() => {
    if (!project) return;
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.streaming || m.error || m.pointerFired) continue;
      const { pointer } = parsePointer(m.text);
      if (pointer && window.guided?.showPointer) {
        window.guided.showPointer(pointer);
        pointerFiredRef.current?.(m.id);
      }
    }
  }, [messages, project?.id]);

  // Scan finalized assistant messages for SEARCH_IMAGE tokens and fetch thumbnails once.
  useEffect(() => {
    if (!project) return;
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.streaming || m.error || m.searchInitiated) continue;
      if (inFlightSearchesRef.current.has(m.id)) continue;

      const { searchQuery } = parseSearchImage(m.text);
      if (!searchQuery || !window.guided?.searchImages) continue;

      const messageId = m.id;
      inFlightSearchesRef.current.add(messageId);

      window.guided
        .searchImages(searchQuery)
        .then((images) => {
          searchResultsRef.current?.(messageId, searchQuery, Array.isArray(images) ? images : []);
        })
        .catch(() => {
          searchResultsRef.current?.(messageId, searchQuery, []);
        })
        .finally(() => {
          inFlightSearchesRef.current.delete(messageId);
        });
    }
  }, [messages, project?.id]);

  // Auto-kickoff the Vision Session for new, empty, vision-incomplete projects.
  useEffect(() => {
    if (!project || !apiKey) return;
    if (project.visionComplete) return;
    if (project.visionInitiated) return;
    if ((project.messages?.length ?? 0) > 0) return;
    if (visionStartedRef.current.has(project.id)) return;

    visionStartedRef.current.add(project.id);
    startVisionSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, apiKey, project?.visionComplete, project?.visionInitiated]);

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-panel-muted">No project open.</p>
        <button
          onClick={onOpenProjects}
          className="rounded-md bg-panel-accent/90 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-panel-accent"
        >
          Open Projects
        </button>
      </div>
    );
  }

  async function startVisionSession() {
    if (!project || !apiKey) return;

    const synthMsg = {
      id: `u-${Date.now()}-vstart`,
      role: 'user',
      text: VISION_KICKOFF_TEXT,
      hidden: true,
    };
    const assistantId = `a-${Date.now()}-vstart`;
    const placeholder = {
      id: assistantId,
      role: 'assistant',
      text: '',
      streaming: true,
    };

    onUpdate((p) => ({
      ...p,
      visionInitiated: true,
      messages: [...p.messages, synthMsg, placeholder],
    }));
    setSending(true);

    const apiMessages = [{ role: 'user', content: VISION_KICKOFF_TEXT }];

    try {
      await streamChat({
        mode: chatMode,
        apiKey,
        sessionToken: chatMode === 'subscription' ? await (getSessionToken?.() ?? null) : null,
        messages: apiMessages,
        projectDescription: project.description,
        activeApp,
        roadmapOfferEnabled: false,
        visionActive: true,
        activePhase: null,
        onDelta: (delta) => {
          onUpdate((p) => ({
            ...p,
            messages: p.messages.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + delta } : m
            ),
          }));
        },
      });
      onUpdate((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        ),
      }));
    } catch (err) {
      const errorKind = classifyError(err);
      onUpdate((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, error: true, errorKind, text: '' }
            : m
        ),
      }));
    } finally {
      setSending(false);
    }
  }

  function buildRoadmapFromVision(messageId) {
    if (sending) return;
    const conversationForRoadmap = messages.filter((m) => !m.hidden);

    onUpdate((p) => ({
      ...p,
      visionComplete: true,
      roadmapOffered: true,
      messages: [
        ...p.messages.map((m) =>
          m.id === messageId ? { ...m, buildRoadmapClicked: true } : m
        ),
        { id: `u-${Date.now()}-build`, role: 'user', text: 'Build my roadmap →' },
      ],
    }));

    onTriggerVisionRoadmap?.(conversationForRoadmap);
  }

  function keepExploringIdea(messageId) {
    if (sending) return;
    onUpdate((p) => ({
      ...p,
      messages: p.messages.map((m) =>
        m.id === messageId ? { ...m, buildRoadmapClicked: true } : m
      ),
    }));
    send('Keep working through the idea');
  }

  function flashCapture() {
    setCaptureFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setCaptureFlash(false), 2000);
  }

  function openFilePicker() {
    setAttachError('');
    fileInputRef.current?.click();
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setAttachError('Only JPG, PNG, GIF, or WEBP images are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachError('Image is too large (5MB max).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl !== 'string') {
        setAttachError('Could not read the image.');
        return;
      }
      setAttachedImage({ dataUrl, name: file.name, size: file.size });
      setAttachError('');
    };
    reader.onerror = () => {
      setAttachError('Could not read the image.');
    };
    reader.readAsDataURL(file);
  }

  function removeAttachment() {
    setAttachedImage(null);
    setAttachError('');
  }

  async function send(textOverride) {
    const isOverride = typeof textOverride === 'string';
    const rawText = (isOverride ? textOverride : draft).trim();
    const hasAttachment = !isOverride && Boolean(attachedImage);
    const text = rawText || (hasAttachment ? IMAGE_ONLY_DEFAULT_PROMPT : '');
    if (!text || sending) return;

    let imageBlock = null;
    if (hasAttachment) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(attachedImage.dataUrl);
      if (m) {
        imageBlock = {
          type: 'image',
          source: { type: 'base64', media_type: m[1], data: m[2] },
        };
      }
      if (window.guided?.saveProjectImage) {
        try {
          await window.guided.saveProjectImage(
            project.id,
            attachedImage.name ?? 'image',
            attachedImage.dataUrl
          );
        } catch {
          // Disk save failed — still send the API request.
        }
      }
    } else if (shouldCapture(text) && window.guided?.captureScreen) {
      try {
        const result = await window.guided.captureScreen();
        if (result?.ok && result.dataUrl) {
          const m = /^data:([^;]+);base64,(.+)$/.exec(result.dataUrl);
          if (m) {
            imageBlock = {
              type: 'image',
              source: { type: 'base64', media_type: m[1], data: m[2] },
            };
          }
        }
      } catch {
        // Capture failed silently — fall through and send text only.
      }
    }

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
    const assistantId = `a-${Date.now()}`;
    const placeholder = { id: assistantId, role: 'assistant', text: '', streaming: true };

    onUpdate((p) => ({
      ...p,
      messages: [...p.messages, userMsg, placeholder],
    }));
    if (!isOverride) setDraft('');
    if (hasAttachment) {
      setAttachedImage(null);
      setAttachError('');
    }
    setSending(true);
    if (imageBlock && !hasAttachment) flashCapture();

    const apiMessages = messages.map((m) => ({ role: m.role, content: m.text }));
    apiMessages.push(
      imageBlock
        ? { role: 'user', content: [imageBlock, { type: 'text', text }] }
        : { role: 'user', content: text }
    );

    try {
      await streamChat({
        mode: chatMode,
        apiKey,
        sessionToken: chatMode === 'subscription' ? await (getSessionToken?.() ?? null) : null,
        messages: apiMessages,
        projectDescription: project.description,
        activeApp,
        roadmapOfferEnabled: !project.roadmapOffered && project.visionComplete === true,
        visionActive: !project.visionComplete,
        activePhase: project.roadmap?.phases?.find((ph) => ph.status === 'active') ?? null,
        onDelta: (delta) => {
          onUpdate((p) => ({
            ...p,
            messages: p.messages.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + delta } : m
            ),
          }));
        },
      });
      onUpdate((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        ),
      }));
    } catch (err) {
      const errorKind = classifyError(err);
      onUpdate((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, error: true, errorKind, text: '' }
            : m
        ),
      }));
    } finally {
      setSending(false);
    }
  }

  async function retry(assistantId) {
    if (sending) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx <= 0) return;
    const userMsg = messages[idx - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    onUpdate((p) => ({
      ...p,
      messages: p.messages.map((m) =>
        m.id === assistantId
          ? { ...m, streaming: true, error: false, errorKind: undefined, text: '' }
          : m
      ),
    }));
    setSending(true);

    const apiMessages = messages
      .slice(0, idx)
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      await streamChat({
        mode: chatMode,
        apiKey,
        sessionToken: chatMode === 'subscription' ? await (getSessionToken?.() ?? null) : null,
        messages: apiMessages,
        projectDescription: project.description,
        activeApp,
        roadmapOfferEnabled: !project.roadmapOffered && project.visionComplete === true,
        visionActive: !project.visionComplete,
        activePhase: project.roadmap?.phases?.find((ph) => ph.status === 'active') ?? null,
        onDelta: (delta) => {
          onUpdate((p) => ({
            ...p,
            messages: p.messages.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + delta } : m
            ),
          }));
        },
      });
      onUpdate((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        ),
      }));
    } catch (err) {
      const errorKind = classifyError(err);
      onUpdate((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, error: true, errorKind, text: '' }
            : m
        ),
      }));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function acceptOffer() {
    if (sending) return;
    const conversationForRoadmap = messages.slice();
    onUpdate((p) => ({
      ...p,
      roadmapOffered: true,
      messages: [
        ...p.messages,
        { id: `u-${Date.now()}`, role: 'user', text: ROADMAP_OFFER_ACCEPT_LABEL },
        { id: `a-${Date.now() + 1}`, role: 'assistant', text: ROADMAP_ACCEPT_ACK },
      ],
    }));
    onAcceptRoadmapOffer?.(conversationForRoadmap);
  }

  function declineOffer() {
    if (sending) return;
    onUpdate((p) => ({
      ...p,
      roadmapOffered: true,
      messages: [
        ...p.messages,
        { id: `u-${Date.now()}`, role: 'user', text: ROADMAP_OFFER_DECLINE_LABEL },
        { id: `a-${Date.now() + 1}`, role: 'assistant', text: ROADMAP_DECLINE_RESPONSE },
      ],
    }));
  }

  function toggleChipSelection(messageId, chip) {
    setChipSelections((prev) => {
      const current = prev[messageId] ?? [];
      const next = current.includes(chip)
        ? current.filter((c) => c !== chip)
        : [...current, chip];
      return { ...prev, [messageId]: next };
    });
  }

  function continueMultiChip(messageId) {
    const selected = chipSelections[messageId] ?? [];
    if (selected.length === 0 || sending) return;
    setChipSelections((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    send(selected.join(', '));
  }

  function startFromRoadmap(messageId) {
    const firstPhase = project.roadmap?.phases?.[0];
    const chips = buildRoadmapStartChips(firstPhase);
    const text = `${ROADMAP_START_FOLLOWUP}\nCHIPS:${JSON.stringify(chips)}`;

    onUpdate((p) => ({
      ...p,
      messages: [
        ...p.messages.map((m) =>
          m.id === messageId ? { ...m, roadmapPromptResolved: true } : m
        ),
        {
          id: `a-${Date.now()}-roadmap-start`,
          role: 'assistant',
          text,
        },
      ],
    }));
  }

  function dismissRoadmapPrompt(messageId) {
    onUpdate((p) => ({
      ...p,
      messages: p.messages.map((m) =>
        m.id === messageId ? { ...m, roadmapPromptResolved: true } : m
      ),
    }));
  }

  function dismissNudge(messageId) {
    onUpdate((p) => ({
      ...p,
      messages: p.messages.map((m) =>
        m.id === messageId ? { ...m, nudgeDismissed: true } : m
      ),
    }));
  }

  function completePhaseFromNudge(messageId, phaseId) {
    onMarkPhaseComplete?.(phaseId);
    onUpdate((p) => ({
      ...p,
      messages: [
        ...p.messages.map((m) =>
          m.id === messageId ? { ...m, nudgeDismissed: true } : m
        ),
        {
          id: `a-${Date.now()}-phase`,
          role: 'assistant',
          text: PHASE_COMPLETE_CONFIRMATION,
        },
      ],
    }));
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowScrollBtn(false);
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectChatHeader project={project} onBack={onBack} activeApp={activeApp} />
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-3 space-y-2">
          {!apiKey && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              No API key set.{' '}
              <button
                onClick={onOpenSettings}
                className="underline underline-offset-2 hover:text-amber-100"
              >
                Open Settings
              </button>{' '}
              to add one.
            </div>
          )}
          {messages.length === 0 && project.visionComplete && (
            <Message
              role="assistant"
              text="What are you working on? Tell me as much or as little as you like — we'll figure out the rest together."
            />
          )}
          {messages.map((m, i) => {
            if (m.hidden) return null;
            if (m.role !== 'assistant') {
              return (
                <Message
                  key={m.id}
                  role={m.role}
                  text={m.text}
                  streaming={m.streaming}
                  error={m.error}
                />
              );
            }

            const isLast = i === messages.length - 1;

            if (m.error) {
              return (
                <ErrorBubble
                  key={m.id}
                  kind={m.errorKind ?? 'generic'}
                  canRetry={isLast && !sending}
                  onRetry={() => retry(m.id)}
                  onOpenSettings={onOpenSettings}
                />
              );
            }

            const offer = parseOffer(m.text);

            if (offer.isOffer) {
              const showOfferChips = isLast && !m.streaming && !m.error;
              return (
                <div key={m.id}>
                  <Message
                    role="assistant"
                    text={offer.displayText}
                    streaming={m.streaming}
                    error={m.error}
                  />
                  {showOfferChips && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        onClick={acceptOffer}
                        disabled={sending}
                        className="no-drag rounded-full border border-panel-accent/60 bg-panel-accent/15 px-2.5 py-1 text-[11px] font-medium text-panel-text transition-colors hover:bg-panel-accent/25 disabled:opacity-40"
                      >
                        {ROADMAP_OFFER_ACCEPT_LABEL}
                      </button>
                      <button
                        onClick={declineOffer}
                        disabled={sending}
                        className="no-drag rounded-full border border-panel-border bg-panel-bg/60 px-2.5 py-1 text-[11px] text-panel-text transition-colors hover:border-panel-accent/60 hover:bg-panel-surface disabled:opacity-40"
                      >
                        {ROADMAP_OFFER_DECLINE_LABEL}
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            if (offer.isPartial) {
              return (
                <Message key={m.id} role="assistant" text="" streaming={true} />
              );
            }

            if (m.kind === 'roadmap-ready') {
              const showRoadmapPrompt =
                isLast && !m.streaming && !m.error && !m.roadmapPromptResolved;
              return (
                <div key={m.id}>
                  <Message
                    role="assistant"
                    text={m.text}
                    streaming={m.streaming}
                    error={m.error}
                  />
                  {showRoadmapPrompt && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => startFromRoadmap(m.id)}
                        disabled={sending}
                        className="no-drag rounded-full border border-panel-accent/60 bg-panel-accent/15 px-2.5 py-1 text-[11px] font-medium text-panel-text transition-colors hover:bg-panel-accent/25 disabled:opacity-40"
                      >
                        Let&apos;s get started
                      </button>
                      <button
                        onClick={() => dismissRoadmapPrompt(m.id)}
                        disabled={sending}
                        className="no-drag rounded-full border border-panel-border bg-panel-bg/60 px-2.5 py-1 text-[11px] text-panel-text transition-colors hover:border-panel-accent/60 hover:bg-panel-surface disabled:opacity-40"
                      >
                        Not right now
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            const { hasNudge, displayText: nudgeStripped } = splitNudge(m.text);
            const { displayText: pointerStripped } = parsePointer(nudgeStripped);
            const { displayText: searchStripped } = parseSearchImage(pointerStripped);
            const { displayText: buildStripped, hasBuildRoadmap } =
              parseBuildRoadmap(searchStripped);
            const { displayText: conceptStripped } = parseConcept(buildStripped);
            const { displayText, chips, chipsMulti } = splitChips(conceptStripped);
            const searchImages = Array.isArray(m.searchImages) ? m.searchImages : null;
            const showBuildRoadmap =
              hasBuildRoadmap &&
              isLast &&
              !m.streaming &&
              !m.error &&
              !m.buildRoadmapClicked;
            const showChips =
              isLast &&
              !m.streaming &&
              !m.error &&
              chips &&
              chips.length > 0 &&
              !showBuildRoadmap;
            const activePhase = project.roadmap?.phases?.find(
              (ph) => ph.status === 'active'
            );
            const showNudge =
              hasNudge &&
              isLast &&
              !m.streaming &&
              !m.error &&
              !m.nudgeDismissed &&
              Boolean(activePhase);

            return (
              <div key={m.id}>
                <Message
                  role="assistant"
                  text={displayText}
                  streaming={m.streaming}
                  error={m.error}
                />
                {searchImages && searchImages.length > 0 && (
                  <ImageThumbnailRow images={searchImages} />
                )}
                {showNudge && (
                  <NudgePrompt
                    onComplete={() => completePhaseFromNudge(m.id, activePhase.id)}
                    onDismiss={() => dismissNudge(m.id)}
                  />
                )}
                {showBuildRoadmap && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => buildRoadmapFromVision(m.id)}
                      disabled={sending}
                      className="no-drag rounded-full border border-panel-accent/60 bg-panel-accent/15 px-3 py-1 text-[11px] font-medium text-panel-text transition-colors hover:bg-panel-accent/25 disabled:opacity-40"
                    >
                      Build my roadmap →
                    </button>
                    <button
                      onClick={() => keepExploringIdea(m.id)}
                      disabled={sending}
                      className="no-drag rounded-full border border-panel-border bg-panel-bg/60 px-3 py-1 text-[11px] text-panel-text transition-colors hover:border-panel-accent/60 hover:bg-panel-surface disabled:opacity-40"
                    >
                      Keep working through the idea
                    </button>
                  </div>
                )}
                {showChips && (
                  <ChipBar
                    chips={chips}
                    multi={chipsMulti}
                    selected={chipSelections[m.id] ?? []}
                    sending={sending}
                    onSingle={(chip) => send(chip)}
                    onToggle={(chip) => toggleChipSelection(m.id, chip)}
                    onContinue={() => continueMultiChip(m.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="no-drag absolute bottom-2 right-3 z-10 grid h-7 w-7 place-items-center rounded-full border border-panel-border bg-panel-surface shadow-lg text-panel-muted transition-colors hover:text-panel-text"
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="no-drag border-t border-panel-border bg-panel-surface/40 p-2">
        <div
          className={`flex justify-end overflow-hidden transition-all duration-500 ease-out ${
            captureFlash ? 'mb-1.5 max-h-6 opacity-100' : 'mb-0 max-h-0 opacity-0'
          }`}
          aria-hidden={!captureFlash}
        >
          <ScreenVisiblePill />
        </div>
        {attachedImage && (
          <div className="mb-1.5 flex items-center gap-2">
            <div className="relative shrink-0">
              <img
                src={attachedImage.dataUrl}
                alt={attachedImage.name}
                className="h-12 w-12 rounded-md border border-panel-border object-cover"
              />
              <button
                onClick={removeAttachment}
                title="Remove image"
                aria-label="Remove image"
                className="no-drag absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full border border-panel-border bg-panel-bg text-panel-muted transition-colors hover:text-panel-text"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <span className="min-w-0 flex-1 truncate text-[11px] text-panel-muted">
              {attachedImage.name}
            </span>
          </div>
        )}
        {attachError && (
          <div className="mb-1.5 text-[11px] text-red-300">{attachError}</div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex items-end gap-2 rounded-lg border border-panel-border bg-panel-bg px-2 py-1.5 focus-within:border-panel-accent/60">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={sending}
            title="Attach image"
            aria-label="Attach image"
            className="no-drag grid h-7 w-7 shrink-0 place-items-center rounded text-panel-muted transition-colors hover:bg-panel-surface hover:text-panel-text disabled:opacity-40"
          >
            <PaperclipIcon />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message Guided…"
            disabled={sending}
            className="flex-1 resize-none bg-transparent text-sm text-panel-text placeholder:text-panel-muted/70 outline-none max-h-24 disabled:opacity-60"
          />
          <button
            onClick={() => send()}
            disabled={(!draft.trim() && !attachedImage) || sending}
            className="rounded-md bg-panel-accent/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-opacity hover:bg-panel-accent disabled:opacity-40"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScreenVisiblePill() {
  return (
    <div className="flex items-center gap-1 rounded-full border border-panel-border bg-panel-bg px-2 py-0.5 text-[10px] text-panel-muted">
      <svg
        viewBox="0 0 24 24"
        className="h-2.5 w-2.5 text-panel-accent animate-pulse"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>Screen visible</span>
    </div>
  );
}

function ProjectChatHeader({ project, onBack, activeApp }) {
  return (
    <div className="no-drag flex items-center gap-2 px-2 py-1.5 border-b border-panel-border bg-panel-surface/30">
      <button
        onClick={onBack}
        title="Back to projects"
        aria-label="Back to projects"
        className="grid h-6 w-6 place-items-center rounded text-panel-muted transition-colors hover:bg-panel-bg hover:text-panel-text"
      >
        <BackIcon />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-panel-text truncate">{project.name}</div>
        {project.description && (
          <div className="text-[10px] text-panel-muted truncate">{project.description}</div>
        )}
      </div>
      {activeApp && <ActiveAppPill name={activeApp} />}
    </div>
  );
}

function ActiveAppPill({ name }) {
  return (
    <div
      title={`Guided is watching ${name}`}
      className="flex shrink-0 items-center gap-1 rounded-full border border-panel-border/60 bg-panel-bg/60 px-1.5 py-0.5 text-[10px] text-panel-muted"
    >
      <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
      <span className="max-w-[90px] truncate">{name}</span>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function Message({ role, text, streaming, error }) {
  const isUser = role === 'user';
  const base = 'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug whitespace-pre-wrap break-words';
  const cls = isUser
    ? `${base} bg-panel-accent/90 text-white`
    : error
      ? `${base} bg-red-500/10 border border-red-500/40 text-red-200`
      : `${base} bg-panel-surface text-panel-text border border-panel-border`;

  const parts = linkify(text);

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={cls}>
        {parts.map((p, i) =>
          p.type === 'link' ? (
            <LinkChunk key={i} href={p.value} role={role} />
          ) : (
            <span key={i}>{p.value}</span>
          )
        )}
        {streaming && <Caret />}
      </div>
    </div>
  );
}

function LinkChunk({ href, role }) {
  function open(e) {
    e.preventDefault();
    const url = resolveLinkUrl(href);
    if (url && window.guided?.openExternal) {
      window.guided.openExternal(url);
    }
  }
  const cls =
    role === 'user'
      ? 'no-drag underline underline-offset-2 decoration-white/70 hover:decoration-white cursor-pointer break-all'
      : 'no-drag text-panel-accent underline underline-offset-2 hover:opacity-80 cursor-pointer break-all';
  return (
    <a href={resolveLinkUrl(href)} onClick={open} className={cls}>
      {href}
    </a>
  );
}

function ChipBar({ chips, multi, selected, sending, onSingle, onToggle, onContinue }) {
  if (multi) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {chips.map((chip, j) => {
          const active = selected.includes(chip);
          return (
            <button
              key={j}
              onClick={() => onToggle(chip)}
              disabled={sending}
              aria-pressed={active}
              className={`no-drag rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                active
                  ? 'border-panel-accent bg-panel-accent/25 text-panel-text'
                  : 'border-panel-border bg-panel-bg/60 text-panel-text hover:border-panel-accent/60 hover:bg-panel-surface'
              }`}
            >
              {chip}
            </button>
          );
        })}
        {selected.length > 0 && (
          <button
            onClick={onContinue}
            disabled={sending}
            className="no-drag rounded-full bg-panel-accent/90 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-panel-accent disabled:opacity-40"
          >
            Continue →
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map((chip, j) => (
        <button
          key={j}
          onClick={() => onSingle(chip)}
          disabled={sending}
          className="no-drag rounded-full border border-panel-border bg-panel-bg/60 px-2.5 py-1 text-[11px] text-panel-text transition-colors hover:border-panel-accent/60 hover:bg-panel-surface disabled:opacity-40"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse bg-panel-muted/80 align-middle" />
  );
}

function ErrorBubble({ kind, canRetry, onRetry, onOpenSettings }) {
  const message = ERROR_MESSAGES[kind] ?? ERROR_MESSAGES.generic;
  const showRetry = canRetry;
  const showSettings = kind === 'auth';

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm leading-snug text-red-200">
        <div>{message}</div>
        {(showRetry || showSettings) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {showRetry && (
              <button
                onClick={onRetry}
                className="no-drag rounded-md border border-red-500/40 bg-red-500/20 px-2 py-1 text-[11px] font-medium text-red-100 transition-colors hover:bg-red-500/30"
              >
                Retry
              </button>
            )}
            {showSettings && (
              <button
                onClick={onOpenSettings}
                className="no-drag rounded-md border border-red-500/30 bg-transparent px-2 py-1 text-[11px] text-red-200 transition-colors hover:bg-red-500/10"
              >
                Open Settings
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageThumbnailRow({ images }) {
  function open(url) {
    if (!url) return;
    if (window.guided?.openExternal) {
      window.guided.openExternal(url);
    }
  }
  return (
    <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
      {images.map((img, i) => (
        <button
          key={`${img.thumbUrl}-${i}`}
          onClick={() => open(img.source || img.url)}
          title={img.title || 'Open source'}
          className="no-drag block shrink-0 overflow-hidden rounded-md border border-panel-border bg-panel-surface transition-colors hover:border-panel-accent/60"
        >
          <img
            src={img.thumbUrl}
            alt={img.title || 'reference'}
            referrerPolicy="no-referrer"
            className="h-16 w-16 object-cover"
            onError={(e) => {
              e.currentTarget.style.opacity = '0.4';
            }}
          />
        </button>
      ))}
    </div>
  );
}

function NudgePrompt({ onComplete, onDismiss }) {
  return (
    <div className="mt-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
      <div className="text-xs leading-snug text-panel-text">{NUDGE_PROMPT_TEXT}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={onComplete}
          className="no-drag rounded-md bg-emerald-500/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
        >
          {NUDGE_COMPLETE_LABEL}
        </button>
        <button
          onClick={onDismiss}
          className="no-drag rounded-md border border-panel-border bg-panel-bg/60 px-2.5 py-1 text-[11px] text-panel-muted transition-colors hover:text-panel-text"
        >
          {NUDGE_DISMISS_LABEL}
        </button>
      </div>
    </div>
  );
}