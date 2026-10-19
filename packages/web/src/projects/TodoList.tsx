import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { addTodo, moveTodo, readTodo, removeTodo, updateTodo, type TodoItem } from 'promptbook-project';
import type * as Y from 'yjs';
import { shortDate } from '../dates.js';
import { useDocValue } from '../sync/hooks.js';

// The project's to-do list, edited through its Yjs document: tick, add,
// rename, drag to reorder, a note, a due date, delete.
export function TodoList({ doc }: { doc: Y.Doc }) {
  const items = useDocValue(doc, readTodo);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const done = items.filter((t) => t.done).length;

  function add() {
    const text = draft.trim();
    if (text) addTodo(doc, text);
    setDraft('');
  }

  function onDragOver(event: DragEvent<HTMLLIElement>, id: string) {
    if (!dragged || dragged === id) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    setDropAt({ id, after: event.clientY > box.top + box.height / 2 });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    if (dragged && dropAt && dragged !== dropAt.id) {
      moveTodo(doc, dragged, dropAt.after ? { after: dropAt.id } : { before: dropAt.id });
    }
    setDragged(null);
    setDropAt(null);
  }

  return (
    <details className="acc" open>
      <summary>
        To-do{' '}
        <span className="cnt" data-testid="todo-count">
          {done}/{items.length}
        </span>
      </summary>
      <div className="body">
        <div className="bar">
          <i style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
        <ul className="todo">
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id}>
                <TodoEditor doc={doc} item={item} onClose={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={item.id}
                className={[
                  item.done ? 'done' : '',
                  dropAt?.id === item.id ? (dropAt.after ? 'drop-after' : 'drop-before') : '',
                ].join(' ')}
                onDragOver={(e) => onDragOver(e, item.id)}
                onDragLeave={() => setDropAt((d) => (d?.id === item.id ? null : d))}
                onDrop={onDrop}
              >
                <span
                  className="grip"
                  draggable
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    setDragged(item.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.text);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setDropAt(null);
                  }}
                >
                  ⠿
                </span>
                <input
                  type="checkbox"
                  checked={item.done}
                  aria-label={item.text}
                  onChange={(e) => updateTodo(doc, item.id, { done: e.target.checked })}
                />
                <span className="t" onClick={() => setEditing(item.id)}>
                  <span className="tx">{item.text}</span>
                  {item.note && <span className="nt">{item.note}</span>}
                </span>
                {item.due && <span className="due">{shortDate(item.due)}</span>}
                <button className="more" title="Edit, note, due date, delete" onClick={() => setEditing(item.id)}>
                  ⋯
                </button>
              </li>
            ),
          )}
        </ul>
        {adding ? (
          <input
            className="add-input"
            autoFocus
            placeholder="New item, then Enter"
            aria-label="New to-do item"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            onBlur={() => {
              add();
              setAdding(false);
            }}
          />
        ) : (
          <button className="add" onClick={() => setAdding(true)}>
            + Add an item
          </button>
        )}
      </div>
    </details>
  );
}

function TodoEditor({ doc, item, onClose }: { doc: Y.Doc; item: TodoItem; onClose(): void }) {
  const [text, setText] = useState(item.text);
  const [note, setNote] = useState(item.note);
  const [due, setDue] = useState(item.due ?? '');

  function save() {
    // Only the fields that changed, so a concurrent edit of another field
    // made elsewhere survives.
    const patch: { text?: string; note?: string; due?: string | null } = {};
    if (text.trim() && text.trim() !== item.text) patch.text = text.trim();
    if (note.trim() !== item.note) patch.note = note.trim();
    if ((due || null) !== item.due) patch.due = due || null;
    if (Object.keys(patch).length) updateTodo(doc, item.id, patch);
    onClose();
  }

  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') onClose();
  };

  return (
    <div className="todo-edit">
      <input autoFocus aria-label="Item" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={keys} />
      <input
        aria-label="Note"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={keys}
      />
      <div className="acts">
        <input
          type="date"
          aria-label="Due date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onKeyDown={keys}
        />
        <span className="spacer" />
        <button
          className="tb danger"
          onClick={() => {
            removeTodo(doc, item.id);
            onClose();
          }}
        >
          Delete
        </button>
        <button className="tb line" onClick={save}>
          Done
        </button>
      </div>
    </div>
  );
}
