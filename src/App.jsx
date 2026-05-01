import { useEffect, useMemo } from 'react';
import Header from './components/Header.jsx';
import Tabs from './components/Tabs.jsx';
import ChatTab from './components/ChatTab.jsx';
import ProjectsTab from './components/ProjectsTab.jsx';
import RoadmapTab from './components/RoadmapTab.jsx';
import ConceptsTab from './components/ConceptsTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import Onboarding from './components/Onboarding.jsx';
import { useLocalState } from './hooks/useLocalState.js';
import { useActiveApp } from './hooks/useActiveApp.js';
import { ENV_API_KEY, generateRoadmap } from './services/claude.js';
import { ROADMAP_READY_MESSAGE } from './utils/offer.js';

const TABS = ['Chat', 'Projects', 'Roadmap', 'Concepts', 'Settings'];

function migrateLegacyConversations() {
  try {
    const raw = window.localStorage.getItem('guided.conversations');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => ({
      id: c.id,
      name: c.title || 'Untitled project',
      description: '',
      createdAt: c.createdAt ?? Date.now(),
      updatedAt: c.updatedAt ?? Date.now(),
      messages: c.messages ?? [],
    }));
  } catch {
    return [];
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useLocalState('guided.tab', 'Chat');
  const [theme, setTheme] = useLocalState('guided.theme', 'dark');
  const [storedKey, setStoredKey] = useLocalState('guided.apiKey', '');
  const [projects, setProjects] = useLocalState('guided.projects', migrateLegacyConversations);
  const [activeId, setActiveId] = useLocalState('guided.activeId', null);
  const activeApp = useActiveApp();

  const apiKey = storedKey || ENV_API_KEY;

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    if (activeId !== null && !projects.find((p) => p.id === activeId)) {
      setActiveId(null);
    }
  }, [projects, activeId, setActiveId]);

  function updateProject(id, updater) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...updater(p), updatedAt: Date.now() } : p))
    );
  }

  function newProject(name, description) {
    const now = Date.now();
    const p = {
      id: `p-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      description: (description ?? '').trim(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      roadmap: null,
      roadmapStatus: 'idle',
      roadmapOffered: false,
      concepts: [],
    };
    setProjects((prev) => [p, ...prev]);
    setActiveId(p.id);
    setActiveTab('Chat');
    if (window.guided?.ensureProjectFolder) {
      window.guided.ensureProjectFolder(p.id).catch(() => {});
    }
  }

  function renameProject(id, nextName) {
    const trimmed = String(nextName ?? '').trim();
    if (!trimmed) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p
      )
    );
  }

  async function deleteProject(id) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
    if (window.guided?.deleteProjectFolder) {
      try {
        await window.guided.deleteProjectFolder(id);
      } catch {}
    }
  }

  function detectedConcept(projectId, messageId, concept) {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        const existing = proj.concepts ?? [];
        const dupe = existing.some(
          (c) => c.term.toLowerCase() === concept.term.toLowerCase()
        );
        const concepts = dupe
          ? existing
          : [
              {
                id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                term: concept.term,
                definition: concept.definition,
                savedAt: Date.now(),
              },
              ...existing,
            ];
        const messages = proj.messages.map((m) =>
          m.id === messageId ? { ...m, conceptSaved: true } : m
        );
        return { ...proj, concepts, messages };
      })
    );
  }

  function deleteConcept(projectId, conceptId) {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        return {
          ...proj,
          concepts: (proj.concepts ?? []).filter((c) => c.id !== conceptId),
        };
      })
    );
  }

  function markPointerFired(projectId, messageId) {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        return {
          ...proj,
          messages: proj.messages.map((m) =>
            m.id === messageId ? { ...m, pointerFired: true } : m
          ),
        };
      })
    );
  }

  function recordSearchResults(projectId, messageId, query, images) {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        return {
          ...proj,
          messages: proj.messages.map((m) =>
            m.id === messageId
              ? { ...m, searchInitiated: true, searchQuery: query, searchImages: images }
              : m
          ),
        };
      })
    );
  }

  async function runRoadmapGeneration(projectId, projectName, projectDescription, conversation, withReadyMessage) {
    if (!apiKey) return;

    setProjects((prev) =>
      prev.map((proj) =>
        proj.id === projectId ? { ...proj, roadmapStatus: 'pending' } : proj
      )
    );

    try {
      const roadmap = await generateRoadmap({
        apiKey,
        projectName,
        projectDescription,
        conversation,
      });

      setProjects((prev) =>
        prev.map((proj) => {
          if (proj.id !== projectId) return proj;
          const next = { ...proj, roadmap, roadmapStatus: 'ready', updatedAt: Date.now() };
          if (withReadyMessage) {
            next.messages = [
              ...proj.messages,
              {
                id: `a-${Date.now()}-ready`,
                role: 'assistant',
                text: ROADMAP_READY_MESSAGE,
                kind: 'roadmap-ready',
              },
            ];
          }
          return next;
        })
      );
    } catch (err) {
      console.error('[guided] Roadmap generation failed:', err);
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id === projectId ? { ...proj, roadmapStatus: 'failed' } : proj
        )
      );
    }
  }

  function regenerateRoadmap(projectId) {
    const p = projects.find((pp) => pp.id === projectId);
    if (!p) return;
    runRoadmapGeneration(projectId, p.name, p.description, p.messages, false);
  }

  function triggerRoadmapFromOffer(projectId, conversation) {
    const p = projects.find((pp) => pp.id === projectId);
    if (!p) return;
    runRoadmapGeneration(projectId, p.name, p.description, conversation, true);
  }

  function triggerRoadmapFromVision(projectId, conversation) {
    const p = projects.find((pp) => pp.id === projectId);
    if (!p) return;
    runRoadmapGeneration(projectId, p.name, p.description, conversation, true);
  }

  function markPhaseComplete(projectId, phaseId) {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId || !proj.roadmap) return proj;
        const phases = proj.roadmap.phases.map((ph) => ({ ...ph }));
        const idx = phases.findIndex((ph) => ph.id === phaseId);
        if (idx === -1 || phases[idx].status !== 'active') return proj;
        phases[idx].status = 'done';
        if (idx + 1 < phases.length) phases[idx + 1].status = 'active';
        return {
          ...proj,
          roadmap: { ...proj.roadmap, phases },
          updatedAt: Date.now(),
        };
      })
    );
  }

  function selectProject(id) {
    setActiveId(id);
    setActiveTab('Chat');
  }

  function backToProjects() {
    setActiveTab('Projects');
  }

  async function completeOnboarding(key) {
    setStoredKey(key);
    if (window.guided?.saveEnvKey) {
      try {
        await window.guided.saveEnvKey(key);
      } catch {}
    }
    setActiveTab('Projects');
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg text-panel-text border border-panel-border rounded-xl overflow-hidden">
      <Header />
      {!apiKey ? (
        <div className="flex-1 min-h-0">
          <Onboarding onSubmitKey={completeOnboarding} />
        </div>
      ) : (
        <>
          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
          <div className="flex-1 min-h-0">
            {activeTab === 'Chat' && (
              <ChatTab
                apiKey={apiKey}
                project={activeProject}
                activeApp={activeApp}
                onUpdate={(updater) =>
                  activeProject && updateProject(activeProject.id, updater)
                }
                onAcceptRoadmapOffer={(conversation) =>
                  activeProject && triggerRoadmapFromOffer(activeProject.id, conversation)
                }
                onTriggerVisionRoadmap={(conversation) =>
                  activeProject && triggerRoadmapFromVision(activeProject.id, conversation)
                }
                onMarkPhaseComplete={(phaseId) =>
                  activeProject && markPhaseComplete(activeProject.id, phaseId)
                }
                onConceptDetected={(messageId, concept) =>
                  activeProject && detectedConcept(activeProject.id, messageId, concept)
                }
                onPointerFired={(messageId) =>
                  activeProject && markPointerFired(activeProject.id, messageId)
                }
                onSearchResults={(messageId, query, images) =>
                  activeProject && recordSearchResults(activeProject.id, messageId, query, images)
                }
                onBack={backToProjects}
                onOpenProjects={() => setActiveTab('Projects')}
                onOpenSettings={() => setActiveTab('Settings')}
              />
            )}
            {activeTab === 'Projects' && (
              <ProjectsTab
                projects={projects}
                activeId={activeId}
                onSelect={selectProject}
                onCreate={newProject}
                onRename={renameProject}
                onDelete={deleteProject}
              />
            )}
            {activeTab === 'Roadmap' && (
              <RoadmapTab
                project={activeProject}
                onMarkComplete={(phaseId) =>
                  activeProject && markPhaseComplete(activeProject.id, phaseId)
                }
                onRegenerate={() =>
                  activeProject && regenerateRoadmap(activeProject.id)
                }
                canGenerate={Boolean(apiKey)}
              />
            )}
            {activeTab === 'Concepts' && (
              <ConceptsTab
                project={activeProject}
                onDelete={(conceptId) =>
                  activeProject && deleteConcept(activeProject.id, conceptId)
                }
                onOpenProjects={() => setActiveTab('Projects')}
              />
            )}
            {activeTab === 'Settings' && (
              <SettingsTab
                apiKey={storedKey}
                envApiKey={ENV_API_KEY}
                onSaveKey={setStoredKey}
                theme={theme}
                onThemeChange={setTheme}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
