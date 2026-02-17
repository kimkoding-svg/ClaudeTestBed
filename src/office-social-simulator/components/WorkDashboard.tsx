import { WorkTaskType, WorkTaskInstance, SocialCharacter } from '../../shared/types/social-sim';

interface WorkDashboardProps {
  isActive: boolean;
  taskTypes: WorkTaskType[];
  activeTasks: WorkTaskInstance[];
  completedTasks: WorkTaskInstance[];
  characters: SocialCharacter[];
  onAssignTask: (typeId: string) => void;
  onInjectEvent: (type: string) => void;
}

const OFFICE_EVENTS = [
  { type: 'birthday', icon: '\u{1F382}', name: 'Birthday' },
  { type: 'company_meeting', icon: '\u{1F3E2}', name: 'Meeting' },
  { type: 'toilet_clog', icon: '\u{1F6BD}', name: 'Toilet Clog' },
  { type: 'cake_in_kitchen', icon: '\u{1F370}', name: 'Cake!' },
  { type: 'fire_drill', icon: '\u{1F525}', name: 'Fire Drill' },
  { type: 'coffee_machine_broken', icon: '\u2615', name: 'Coffee Down' },
  { type: 'sickness', icon: '\u{1F912}', name: 'Sickness' },
  { type: 'new_hire', icon: '\u{1F44B}', name: 'New Hire' },
];

function getCharName(id: string, characters: SocialCharacter[]): string {
  const ch = characters.find(c => c.id === id);
  return ch ? ch.name.split(' ')[0] : id;
}

export function WorkDashboard({
  isActive,
  taskTypes,
  activeTasks,
  completedTasks,
  characters,
  onAssignTask,
  onInjectEvent,
}: WorkDashboardProps) {
  return (
    <div className="w-64 border-r border-slate-700/50 bg-slate-800/60 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700/40">
        <h2 className="text-sm font-mono text-white tracking-widest uppercase font-bold">
          Dashboard
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Work Tasks Section */}
        <section>
          <h3 className="text-[13px] font-mono text-sky-400 tracking-wider uppercase mb-1.5 px-1 font-medium">
            Assign Work
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {taskTypes.map(t => (
              <button
                key={t.typeId}
                onClick={() => onAssignTask(t.typeId)}
                disabled={!isActive}
                className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-700/40 border border-slate-600/30 hover:border-sky-500/50 hover:bg-slate-700/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-left group rounded"
                title={t.description}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="text-[11px] font-mono text-slate-300 leading-tight truncate group-hover:text-white">
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Office Events Section */}
        <section>
          <h3 className="text-[13px] font-mono text-amber-400 tracking-wider uppercase mb-1.5 px-1 font-medium">
            Events / Disasters
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {OFFICE_EVENTS.map(e => (
              <button
                key={e.type}
                onClick={() => onInjectEvent(e.type)}
                disabled={!isActive}
                className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-900/20 border border-amber-800/30 hover:border-amber-500/50 hover:bg-amber-900/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-left group rounded"
              >
                <span className="text-lg leading-none">{e.icon}</span>
                <span className="text-[11px] font-mono text-amber-200/90 leading-tight truncate group-hover:text-amber-100">
                  {e.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Active Tasks Section */}
        <section>
          <h3 className="text-[13px] font-mono text-emerald-400 tracking-wider uppercase mb-1.5 px-1 font-medium">
            Active Tasks ({activeTasks.length})
          </h3>
          <div className="space-y-1">
            {activeTasks.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 px-1">No active tasks</p>
            ) : (
              activeTasks.map(task => (
                <div key={task.id} className="bg-slate-700/30 border border-slate-600/25 px-2 py-1.5 rounded">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm leading-none">{task.icon}</span>
                    <span className="text-xs font-mono text-white truncate flex-1">
                      {task.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-400">
                      {task.assignedTo.map(id => getCharName(id, characters)).join(', ')}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                      style={{ width: `${Math.round(task.progress * 100)}%` }}
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono text-slate-400">
                      {Math.round(task.progress * 100)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Completed Tasks Section */}
        {completedTasks.length > 0 && (
          <section>
            <h3 className="text-[13px] font-mono text-emerald-500/70 tracking-wider uppercase mb-1.5 px-1 font-medium">
              Completed ({completedTasks.length})
            </h3>
            <div className="space-y-0.5">
              {completedTasks.slice(-8).reverse().map(task => (
                <div key={task.id} className="flex items-center gap-1.5 px-2 py-0.5 opacity-70">
                  <span className="text-xs text-emerald-400">{'\u2713'}</span>
                  <span className="text-sm leading-none">{task.icon}</span>
                  <span className="text-[11px] font-mono text-slate-400 truncate">
                    {task.name}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default WorkDashboard;
