import { useDroppable } from "@dnd-kit/core";
import type { Card, Status } from "../api";
import { CardItem } from "./CardItem";

type ColumnProps = {
  status: Status;
  title: string;
  cards: Card[];
  searching: boolean;
};

export function Column({ status, title, cards, searching }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section ref={setNodeRef} className={`column ${status}${isOver ? " over" : ""}`}>
      <header>
        <h2>{title}</h2>
        <span className="count">{cards.length}</span>
      </header>
      <div className="column-body">
        {cards.length === 0 ? (
          <p className="empty">{searching ? "没有匹配的卡片" : "没有卡片"}</p>
        ) : (
          cards.map((card) => <CardItem key={card.id} card={card} showScore={searching} />)
        )}
      </div>
    </section>
  );
}
