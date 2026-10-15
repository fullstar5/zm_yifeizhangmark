import { FormEvent, useEffect, useRef, useState } from "react";

type CreateCardModalProps = {
  onClose: () => void;
  onCreate: (title: string, description: string) => Promise<void>;
};

export function CreateCardModal({ onClose, onCreate }: CreateCardModalProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    titleRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("名称不能为空");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(nextTitle, description.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
      setSubmitting(false);
    }
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2>创建卡片</h2>
        <label>
          名称
          <input
            ref={titleRef}
            aria-label="名称"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          描述
          <textarea
            aria-label="描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "创建中…" : "创建"}
          </button>
        </div>
      </form>
    </div>
  );
}
