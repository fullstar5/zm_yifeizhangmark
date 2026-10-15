import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "../api";

type CardItemProps = {
  card: Card;
  showScore: boolean;
};

export function CardItem({ card, showScore }: CardItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={isDragging ? "card dragging" : "card"}
      {...listeners}
      {...attributes}
    >
      <h3>{card.title}</h3>
      {card.description ? <p>{card.description}</p> : null}
      {showScore && card.score !== undefined ? (
        <span className="score">{Math.round(card.score * 100)}% 相似</span>
      ) : null}
    </article>
  );
}

export function CardPreview({ card, showScore }: CardItemProps) {
  return (
    <article className="card overlay">
      <h3>{card.title}</h3>
      {card.description ? <p>{card.description}</p> : null}
      {showScore && card.score !== undefined ? (
        <span className="score">{Math.round(card.score * 100)}% 相似</span>
      ) : null}
    </article>
  );
}
