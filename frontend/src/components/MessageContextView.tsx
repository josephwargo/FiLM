import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, MessageSquare, Paperclip, Wand2, Scissors } from 'lucide-react';
import type { ContextSnapshot } from '../types';

function Row({
  icon,
  label,
  badge,
  content,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  content: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ctx-snap-item">
      <button className="ctx-snap-row" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        <span className="ctx-snap-label">{label}</span>
        {badge && (
          <span className="ctx-snap-badge">
            <Scissors size={9} />
            {badge}
          </span>
        )}
      </button>
      {open && <pre className="ctx-snap-content">{content}</pre>}
    </div>
  );
}

export function MessageContextView({ snapshot }: { snapshot: string | null | undefined }) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo<ContextSnapshot | null>(() => {
    if (!snapshot) return null;
    try {
      return JSON.parse(snapshot);
    } catch {
      return null;
    }
  }, [snapshot]);

  if (!parsed) {
    return (
      <div className="ctx-snap">
        <span
          className="ctx-snap-toggle ctx-snap-toggle-static"
          title="No Muse, chats, or files were attached — the model only saw this chat's previous messages"
        >
          <Paperclip size={11} />
          <span>Context · chat history only</span>
        </span>
      </div>
    );
  }

  const sourceCount = parsed.parts.length + (parsed.system_prompt ? 1 : 0);

  return (
    <div className="ctx-snap">
      <button className="ctx-snap-toggle" onClick={() => setOpen((o) => !o)}>
        <Paperclip size={11} />
        <span>
          Context · {sourceCount} source{sourceCount === 1 ? '' : 's'}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>

      {open && (
        <div className="ctx-snap-list">
          {parsed.system_prompt && (
            <Row
              icon={<Wand2 size={12} />}
              label={parsed.muse ? `Muse: ${parsed.muse}` : 'System prompt'}
              content={parsed.system_prompt}
            />
          )}
          {parsed.parts.map((part, i) => (
            <Row
              key={i}
              icon={part.type === 'chat' ? <MessageSquare size={12} /> : <FileText size={12} />}
              label={part.label}
              badge={part.sliced ? 'Sliced' : undefined}
              content={part.content}
            />
          ))}
        </div>
      )}
    </div>
  );
}
