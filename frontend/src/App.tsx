import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { Card, Status, listCards, moveCard, searchCards } from "./api";
import { CardPreview } from "./components/CardItem";
import { Column } from "./components/Column";
import { CreateCardModal } from "./components/CreateCardModal";
import { createCard } from "./api";

const COLUMNS: { status: Status; title: string }[] = [
  { status: "todo", title: "To-do" },
  { status: "doing", title: "Doing" },
  { status: "done", title: "Done" },
];

function isStatus(value: string): value is Status {
  return value === "todo" || value === "doing" || value === "done";
}

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const searching = query.trim().length > 0;
  const activeCard = cards.find((card) => card.id === activeId) ?? null;

  useEffect(() => {
    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      const request = trimmed ? searchCards(trimmed) : listCards();
      request
        .then((result) => {
          setCards(result.cards);
          setError(null);
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : "加载失败");
        });
    }, trimmed ? 400 : 0);
    return () => window.clearTimeout(handle);
  }, [query]);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const nextStatus = event.over ? String(event.over.id) : "";
    if (!isStatus(nextStatus)) return;
    const cardId = String(event.active.id);
    const current = cards.find((card) => card.id === cardId);
    if (!current || current.status === nextStatus) return;

    const previous = cards;
    setCards(cards.map((card) => (card.id === cardId ? { ...card, status: nextStatus } : card)));
    try {
      await moveCard(cardId, nextStatus);
    } catch (caught) {
      setCards(previous);
      setError(caught instanceof Error ? caught.message : "移动失败");
    }
  }

  async function onCreate(title: string, description: string) {
    await createCard(title, description);
    setQuery("");
    setModalOpen(false);
    const result = await listCards();
    setCards(result.cards);
    setError(null);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>看板</h1>
          <p className="hint">语义搜索对英文更稳定，这个嵌入模型不覆盖中文。</p>
        </div>
      </header>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          placeholder="搜索卡片，例如 cannot sign in"
          type="search"
          aria-label="搜索卡片"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="primary" onClick={() => setModalOpen(true)}>
          创建卡片
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="board">
          {COLUMNS.map((column) => (
            <Column
              key={column.status}
              status={column.status}
              title={column.title}
              searching={searching}
              cards={cards.filter((card) => card.status === column.status)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <CardPreview card={activeCard} showScore={searching} /> : null}
        </DragOverlay>
      </DndContext>
      {modalOpen ? (
        <CreateCardModal onClose={() => setModalOpen(false)} onCreate={onCreate} />
      ) : null}
    </main>
  );
}
