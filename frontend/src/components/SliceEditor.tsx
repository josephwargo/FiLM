import type { Message } from '../types';

interface SliceEditorProps {
  startId: string | null;
  endId: string | null;
  messages: Message[] | undefined;
  loading: boolean;
  onUpdate: (patch: { start_message_id?: string | null; end_message_id?: string | null }) => void;
}

export function SliceEditor({ startId, endId, messages, loading, onUpdate }: SliceEditorProps) {
  if (loading || !messages) {
    return <div className="slice-editor"><div className="slice-editor-hint">Loading messages…</div></div>;
  }
  if (messages.length === 0) {
    return <div className="slice-editor"><div className="slice-editor-hint">This chat has no messages yet.</div></div>;
  }

  const rawStart = startId ? messages.findIndex((m) => m.id === startId) : 0;
  const rawEnd = endId ? messages.findIndex((m) => m.id === endId) : messages.length - 1;
  const startIdx = rawStart === -1 ? 0 : rawStart;
  const endIdx = rawEnd === -1 ? messages.length - 1 : rawEnd;

  const inRange = (i: number) => i >= startIdx && i <= endIdx;

  const onMessageClick = (e: React.MouseEvent, m: Message) => {
    if (e.shiftKey) onUpdate({ start_message_id: m.id });
    else onUpdate({ end_message_id: m.id });
  };

  const clearSlice = () => onUpdate({ start_message_id: null, end_message_id: null });
  const hasSlice = Boolean(startId || endId);

  return (
    <div className="slice-editor">
      <div className="slice-editor-hint">
        Click a message to set the <strong>end</strong>. Shift-click to set the <strong>start</strong>.
      </div>
      <div className="slice-editor-messages">
        {messages.map((m, i) => {
          const dimmed = !inRange(i);
          const isStart = i === startIdx;
          const isEnd = i === endIdx;
          return (
            <div
              key={m.id}
              className={`slice-msg slice-msg-${m.role} ${dimmed ? 'slice-msg-dimmed' : ''} ${isStart ? 'slice-msg-start' : ''} ${isEnd ? 'slice-msg-end' : ''}`}
              onClick={(e) => onMessageClick(e, m)}
              title={m.content}
            >
              <span className="slice-msg-role">{m.role === 'user' ? 'user' : 'asst'}</span>
              <span className="slice-msg-content">
                {m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content}
              </span>
            </div>
          );
        })}
      </div>
      {hasSlice && (
        <button className="slice-editor-clear" onClick={clearSlice}>Clear slice</button>
      )}
    </div>
  );
}
