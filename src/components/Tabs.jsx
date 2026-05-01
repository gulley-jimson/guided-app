export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="no-drag flex border-b border-panel-border bg-panel-surface/30">
      {tabs.map((t) => {
        const isActive = t === active;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={[
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              'hover:text-panel-text',
              isActive
                ? 'text-panel-text border-b-2 border-panel-accent'
                : 'text-panel-muted border-b-2 border-transparent',
            ].join(' ')}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
