/**
 * Social Office Simulator — main page.
 *
 * Layout: Top bar → Upper area (3-column) → Bottom panel (conversation log + settings).
 * Auto-starts simulation on mount.
 * Connects to backend via SSE for live updates.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SocialCharacter, WorkTaskType, WorkTaskInstance } from '../../shared/types/social-sim';
import { OfficeCanvas, CharacterScreenPos } from '../components/OfficeCanvas';
import { WorkDashboard } from '../components/WorkDashboard';
import { DialogueBubbles, BubbleData } from '../components/DialogueBubbles';
import {
  connectSocialSSE,
  startSocialSim,
  pauseSocialSim,
  resumeSocialSim,
  stopSocialSim,
  injectSocialEvent,
  updateSocialSettings,
  assignWorkTask,
} from '../services/socialApi';

// ─── Types ───────────────────────────────────────────────

interface SocialSimPageProps {
  onBack: () => void;
}

interface SimTime {
  tick: number;
  hour: number;
  minute: number;
  day: number;
}

interface DialogueLine {
  type: string;
  encounterId: string;
  speakerId: string;
  speakerName: string;
  partnerId?: string;
  partnerName?: string;
  text: string;
  tick: number;
}

// ─── Page Component ──────────────────────────────────────

export function SocialSimPage({ onBack }: SocialSimPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [charPositions, setCharPositions] = useState<CharacterScreenPos[]>([]);
  const [characters, setCharacters] = useState<SocialCharacter[]>([]);
  const [activeBubbles, setActiveBubbles] = useState<BubbleData[]>([]);
  const [canvasRect, setCanvasRect] = useState<{ width: number; height: number; naturalWidth: number; naturalHeight: number } | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const bubbleIdCounter = useRef(0);
  const [simStatus, setSimStatus] = useState<string>('not_initialized');
  const [simTime, setSimTime] = useState<SimTime>({ tick: 0, hour: 9, minute: 0, day: 1 });
  const [recentDialogue, setRecentDialogue] = useState<DialogueLine[]>([]);
  const [activeEvents, setActiveEvents] = useState<Array<{ type: string; name: string }>>([]);
  const [tickSpeed, setTickSpeed] = useState(1000);

  // Task state
  const [taskTypes, setTaskTypes] = useState<WorkTaskType[]>([]);
  const [activeTasks, setActiveTasks] = useState<WorkTaskInstance[]>([]);
  const [completedTasks, setCompletedTasks] = useState<WorkTaskInstance[]>([]);

  const esRef = useRef<EventSource | null>(null);
  const autoStarted = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const updateFromState = useCallback((state: Record<string, unknown>) => {
    if (state.characters && Array.isArray(state.characters)) {
      const mapped: SocialCharacter[] = (state.characters as Record<string, unknown>[]).map((ch) => ({
        id: (ch.id as string) || '',
        name: (ch.name as string) || '',
        appearance: (ch.appearance as SocialCharacter['appearance']) || {
          spriteColors: { primary: '#3b82f6', secondary: '#60a5fa', skin: '#f5d0a9', hair: '#1a1a2e' },
          gender: 'M' as const,
        },
        baseTraits: (ch.baseTraits as SocialCharacter['baseTraits']) || {
          friendliness: 50, humor: 50, seriousness: 50, empathy: 50, assertiveness: 50,
        },
        mood: (ch.mood as number) ?? 50,
        needs: (ch.needs as SocialCharacter['needs']) || { bladder: 0, hunger: 0, thirst: 0 },
        schedule: [],
        position: (ch.position as SocialCharacter['position']) || { x: 20, y: 15 },
        state: (ch.state as SocialCharacter['state']) || 'idle',
        targetPosition: null,
        currentEncounter: null,
        direction: ((ch.position as Record<string, unknown>)?.direction as SocialCharacter['direction']) || 'down',
        animFrame: 0,
        isTemp: (ch.isTemp as boolean) || false,
        currentTask: (ch.currentTask as SocialCharacter['currentTask']) || null,
      }));
      setCharacters(mapped);
    }
    if (state.status) setSimStatus(state.status as string);
    if (state.time) setSimTime(state.time as SimTime);
    if (state.activeEvents) setActiveEvents(state.activeEvents as Array<{ type: string; name: string }>);
    if (state.recentDialogue) {
      setRecentDialogue((state.recentDialogue as DialogueLine[]).slice(-50));
    }
    if (state.activeTasks) setActiveTasks(state.activeTasks as WorkTaskInstance[]);
    if (state.completedTasks) setCompletedTasks(state.completedTasks as WorkTaskInstance[]);
    if (state.registeredTaskTypes) setTaskTypes(state.registeredTaskTypes as WorkTaskType[]);
  }, []);

  // Connect SSE on mount
  useEffect(() => {
    const es = connectSocialSSE((event) => {
      const evt = event as Record<string, unknown>;
      switch (evt.type) {
        case 'state_update':
          if (evt.state) {
            updateFromState(evt.state as Record<string, unknown>);
          }
          break;
        case 'social_status':
          setSimStatus((evt.status as string) || 'unknown');
          if (evt.state) updateFromState(evt.state as Record<string, unknown>);
          break;
        case 'dialogue_line':
          setRecentDialogue(prev => {
            const next = [...prev, evt as unknown as DialogueLine];
            return next.slice(-50);
          });
          // Feed speech bubble
          setActiveBubbles(prev => [
            ...prev,
            {
              id: `bubble_${bubbleIdCounter.current++}`,
              speakerId: evt.speakerId as string,
              speakerName: evt.speakerName as string,
              text: evt.text as string,
              timestamp: Date.now(),
            },
          ]);
          break;
        case 'event_start':
          if (evt.event) {
            setActiveEvents(prev => [...prev, evt.event as { type: string; name: string }]);
          }
          break;
        case 'event_end':
          if (evt.event) {
            const ended = evt.event as { type: string };
            setActiveEvents(prev => prev.filter(e => e.type !== ended.type));
          }
          break;
        case 'task_assigned':
        case 'task_completed':
        case 'task_interrupted':
          break;
      }
    });

    esRef.current = es;
    return () => {
      es.close();
    };
  }, [updateFromState]);

  // Auto-start on mount
  useEffect(() => {
    if (!autoStarted.current) {
      autoStarted.current = true;
      const timer = setTimeout(() => {
        handleStart();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-scroll conversation log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [recentDialogue]);

  // ─── Controls ──────────────────────────────────────────

  const handleStart = async () => {
    await startSocialSim({ tickSpeed, characterCount: 4 });
    setSimStatus('running');
  };

  const handlePause = async () => {
    await pauseSocialSim();
    setSimStatus('paused');
  };

  const handleResume = async () => {
    await resumeSocialSim();
    setSimStatus('running');
  };

  const handleStop = async () => {
    await stopSocialSim();
    setSimStatus('stopped');
    setCharacters([]);
    setRecentDialogue([]);
    setActiveEvents([]);
    setActiveTasks([]);
    setCompletedTasks([]);
    setActiveBubbles([]);
  };

  const handleSpeedChange = async (speed: number) => {
    setTickSpeed(speed);
    if (simStatus === 'running') {
      await updateSocialSettings({ tickSpeed: speed });
    }
  };

  // Track canvas element size for bubble positioning
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const update = () => {
      const canvas = container.querySelector('canvas');
      if (canvas) {
        setCanvasRect({
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          naturalWidth: canvas.width,
          naturalHeight: canvas.height,
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const handleInjectEvent = async (type: string) => {
    await injectSocialEvent({ type, name: type, description: '' });
  };

  const handleAssignTask = async (typeId: string) => {
    await assignWorkTask({ typeId });
  };

  // ─── Derived data ──────────────────────────────────────

  const selected = characters.find(c => c.id === selectedId);
  const isRunning = simStatus === 'running';
  const isPaused = simStatus === 'paused';
  const isActive = isRunning || isPaused;

  const timeStr = `${simTime.hour > 12 ? simTime.hour - 12 : simTime.hour}:${String(simTime.minute).padStart(2, '0')} ${simTime.hour >= 12 ? 'PM' : 'AM'}`;

  // Group dialogue lines by encounter for the conversation log
  const encounterGroups = useMemo(() => {
    const groups = new Map<string, {
      id: string;
      speakerName: string;
      partnerName: string;
      lines: DialogueLine[];
    }>();

    for (const line of recentDialogue) {
      if (!line.encounterId) continue;
      if (!groups.has(line.encounterId)) {
        groups.set(line.encounterId, {
          id: line.encounterId,
          speakerName: line.speakerName,
          partnerName: line.partnerName || '?',
          lines: [],
        });
      }
      groups.get(line.encounterId)!.lines.push(line);
    }

    return Array.from(groups.values());
  }, [recentDialogue]);

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/60 bg-slate-800/90 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm font-mono text-slate-400 hover:text-white tracking-wider uppercase transition-colors"
          >
            &larr; BACK
          </button>
          <div className="w-px h-4 bg-slate-600/40" />
          <h1 className="text-base font-mono text-white tracking-[0.2em] uppercase font-bold">
            SOCIAL OFFICE
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Sim controls */}
          <div className="flex items-center gap-1.5">
            {!isActive && (
              <button
                onClick={handleStart}
                className="px-3 py-1 text-xs font-mono uppercase tracking-wider bg-emerald-600/80 text-white hover:bg-emerald-500 rounded transition-colors"
              >
                Start
              </button>
            )}
            {isRunning && (
              <button
                onClick={handlePause}
                className="px-3 py-1 text-xs font-mono uppercase tracking-wider bg-amber-600/80 text-white hover:bg-amber-500 rounded transition-colors"
              >
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={handleResume}
                className="px-3 py-1 text-xs font-mono uppercase tracking-wider bg-emerald-600/80 text-white hover:bg-emerald-500 rounded transition-colors"
              >
                Resume
              </button>
            )}
            {isActive && (
              <button
                onClick={handleStop}
                className="px-3 py-1 text-xs font-mono uppercase tracking-wider bg-rose-600/80 text-white hover:bg-rose-500 rounded transition-colors"
              >
                Stop
              </button>
            )}
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {[
              { label: '1x', speed: 2000 },
              { label: '2x', speed: 1000 },
              { label: '5x', speed: 400 },
            ].map(({ label, speed }) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`px-2 py-0.5 text-[11px] font-mono uppercase rounded transition-colors ${
                  tickSpeed === speed
                    ? 'bg-sky-600/80 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Time + status */}
          <span className="text-[13px] font-mono text-slate-300 tracking-wider">
            DAY {simTime.day} &middot; {timeStr}
          </span>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-600'
            }`} />
            <span className="text-xs font-mono text-slate-400 tracking-wider uppercase">
              {simStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Active events banner */}
      {activeEvents.length > 0 && (
        <div className="px-4 py-1.5 bg-amber-950/40 border-b border-amber-800/30 flex items-center gap-2">
          <span className="text-xs font-mono text-amber-300 uppercase tracking-wider font-bold">Events:</span>
          {activeEvents.map((evt, i) => (
            <span key={i} className="text-xs font-mono text-amber-200 bg-amber-800/40 px-2.5 py-0.5 rounded-full">
              {evt.name || evt.type}
            </span>
          ))}
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Upper section: 3-column layout */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT: Work Dashboard */}
          <WorkDashboard
            isActive={isActive}
            taskTypes={taskTypes}
            activeTasks={activeTasks}
            completedTasks={completedTasks}
            characters={characters}
            onAssignTask={handleAssignTask}
            onInjectEvent={handleInjectEvent}
          />

          {/* CENTER: Canvas */}
          <div ref={canvasContainerRef} className="flex-1 flex items-center justify-center bg-slate-950 overflow-hidden p-2 relative">
            <OfficeCanvas
              characters={characters}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPositionsUpdate={setCharPositions}
            />
            <DialogueBubbles
              bubbles={activeBubbles}
              characterPositions={charPositions}
              canvasRect={canvasRect}
            />
          </div>

          {/* RIGHT: Character inspector */}
          <div className="w-72 border-l border-slate-700/50 bg-slate-800/60 flex flex-col overflow-y-auto">
            {selected ? (
              <div className="p-3 space-y-3">
                {/* Character info */}
                <div>
                  <h2 className="text-base font-mono text-white tracking-wider uppercase font-bold">
                    {selected.name}
                  </h2>
                  <p className="text-[13px] font-mono text-slate-400 mt-0.5">
                    {selected.appearance.gender === 'M' ? 'Male' : 'Female'} &middot;{' '}
                    <span className={
                      selected.state === 'working' ? 'text-emerald-400' :
                      selected.state === 'talking' ? 'text-violet-400' :
                      selected.state === 'busy' ? 'text-sky-400' :
                      'text-slate-400'
                    }>
                      {selected.state}
                    </span>
                  </p>
                </div>

                {/* Mood */}
                <div>
                  <div className="flex justify-between text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    <span>Mood</span>
                    <span className="text-white">{Math.round(selected.mood)}</span>
                  </div>
                  <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${selected.mood}%`,
                        backgroundColor: selected.mood > 60 ? '#34d399' : selected.mood > 30 ? '#fbbf24' : '#f87171',
                      }}
                    />
                  </div>
                </div>

                {/* Current Task */}
                {selected.currentTask && (
                  <div>
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Current Task</span>
                    <div className="mt-1 bg-slate-700/40 border border-slate-600/40 px-2.5 py-2 rounded-lg">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg leading-none">{selected.currentTask.icon}</span>
                        <span className="text-sm font-mono text-white font-medium">{selected.currentTask.name}</span>
                      </div>
                      <div className="h-2 bg-slate-600 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                          style={{ width: `${Math.round(selected.currentTask.progress * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400">
                        <span>{Math.round(selected.currentTask.progress * 100)}%</span>
                        <span>~{Math.round(selected.currentTask.durationTicks * (1 - selected.currentTask.progress))} ticks left</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Needs */}
                <div className="space-y-2">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Needs</span>
                  {(['bladder', 'hunger', 'thirst'] as const).map(need => (
                    <div key={need}>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-0.5">
                        <span>{need}</span>
                        <span className="text-slate-300">{Math.round(selected.needs[need])}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${selected.needs[need]}%`,
                            backgroundColor: selected.needs[need] > 70 ? '#f87171' : '#60a5fa',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Traits */}
                <div className="space-y-2">
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Traits</span>
                  {Object.entries(selected.baseTraits).map(([trait, value]) => (
                    <div key={trait}>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-0.5">
                        <span>{trait}</span>
                        <span className="text-slate-300">{value}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500/60 rounded-full"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Position */}
                <div className="text-xs font-mono text-slate-500 mt-2">
                  Position: ({Math.round(selected.position.x)}, {Math.round(selected.position.y)})
                  &middot; {selected.direction}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-[13px] font-mono text-slate-500 text-center tracking-wider">
                  Click a character<br />to inspect
                </p>
              </div>
            )}

            {/* Character list */}
            <div className="border-t border-slate-700/40 p-3 mt-auto">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">
                Characters ({characters.length})
              </span>
              <div className="mt-2 space-y-1">
                {characters.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedId(ch.id === selectedId ? null : ch.id)}
                    className={`w-full text-left px-2.5 py-1.5 text-xs font-mono tracking-wider transition-colors rounded-md ${
                      ch.id === selectedId
                        ? 'bg-sky-600/30 text-white border border-sky-500/40'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/60 border border-transparent'
                    }`}
                  >
                    {ch.name}
                    <span className={`ml-2 ${
                      ch.state === 'working' ? 'text-emerald-400' :
                      ch.state === 'talking' ? 'text-violet-400' :
                      ch.state === 'busy' ? 'text-sky-400' :
                      'text-slate-500'
                    }`}>
                      {ch.state}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom panel: Conversation logs + settings */}
        <div className="h-[30%] min-h-[160px] border-t border-slate-700/60 bg-slate-800/80 flex">
          {/* Conversation log */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-700/40 flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-white uppercase tracking-wider font-bold">Conversation Log</span>
              <span className="text-xs font-mono text-slate-500">({encounterGroups.length} encounters)</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {encounterGroups.length === 0 ? (
                <p className="text-xs font-mono text-slate-500 italic">No conversations yet. Characters will talk when they meet in the same zone.</p>
              ) : (
                encounterGroups.map(group => (
                  <div key={group.id} className="bg-slate-700/30 rounded-lg border border-slate-600/30 overflow-hidden">
                    {/* Encounter header */}
                    <div className="px-3 py-1.5 bg-slate-700/40 border-b border-slate-600/20 flex items-center gap-2">
                      <span className="text-violet-400 text-xs">&#9679;</span>
                      <span className="text-xs font-mono text-white font-medium">
                        {group.speakerName}
                      </span>
                      <span className="text-xs font-mono text-slate-500">&harr;</span>
                      <span className="text-xs font-mono text-white font-medium">
                        {group.partnerName}
                      </span>
                    </div>
                    {/* Dialogue lines */}
                    <div className="px-3 py-2 space-y-1.5">
                      {group.lines.map((line, i) => (
                        <div key={i} className="flex gap-2 text-[13px] font-mono leading-relaxed">
                          <span className={`shrink-0 font-bold ${
                            line.speakerId === group.lines[0]?.speakerId ? 'text-sky-400' : 'text-amber-400'
                          }`}>
                            {line.speakerName.split(' ')[0]}:
                          </span>
                          <span className="text-slate-200">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Settings panel */}
          <div className="w-56 border-l border-slate-700/40 p-3 flex flex-col gap-3 overflow-y-auto">
            <span className="text-xs font-mono text-white uppercase tracking-wider font-bold">Settings</span>

            {/* Speed control */}
            <div>
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Tick Speed</label>
              <div className="flex gap-1 mt-1">
                {[
                  { label: '1x', speed: 2000 },
                  { label: '2x', speed: 1000 },
                  { label: '5x', speed: 400 },
                  { label: '10x', speed: 200 },
                ].map(({ label, speed }) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`flex-1 px-1 py-1 text-[11px] font-mono rounded transition-colors ${
                      tickSpeed === speed
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Stats</label>
              <div className="text-[11px] font-mono text-slate-300 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Characters</span>
                  <span>{characters.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Tasks</span>
                  <span>{activeTasks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed Tasks</span>
                  <span>{completedTasks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Conversations</span>
                  <span>{encounterGroups.length}</span>
                </div>
              </div>
            </div>

            {/* Active events */}
            {activeEvents.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">Active Events</label>
                {activeEvents.map((evt, i) => (
                  <div key={i} className="text-[11px] font-mono text-amber-200 bg-amber-900/30 px-2 py-1 rounded">
                    {evt.name || evt.type}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SocialSimPage;
