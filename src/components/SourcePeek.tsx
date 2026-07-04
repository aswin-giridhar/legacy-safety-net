import { useEffect } from "react";

export interface PeekTarget {
  file: string;
  line: number;
}

export default function SourcePeek({
  sources,
  target,
  onClose,
}: {
  sources: Record<string, string>;
  target: PeekTarget;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const content = sources[target.file];
  const allLines = content ? content.split("\n") : [];
  const has = allLines.length > 0;
  const focus = target.line;
  const from = Math.max(1, focus - 6);
  const to = has ? Math.min(allLines.length, focus + 8) : 0;

  return (
    <div className="peekwrap" onClick={onClose}>
      <div className="peek" onClick={(e) => e.stopPropagation()}>
        <div className="peekhead">
          <span className="peekfile">{target.file}<span className="peekln">:{focus}</span></span>
          <button className="peekclose" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {has ? (
          <pre className="peekcode">
            {allLines.slice(from - 1, to).map((ln, i) => {
              const num = from + i;
              const isFocus = num === focus;
              return (
                <div key={num} className={isFocus ? "pl focus" : "pl"}>
                  <span className="plnum">{num}</span>
                  <span className="pltext">{ln || " "}</span>
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="peekempty">
            External interface — no source in this repository. This node is referenced by the
            code but its definition (a table, file, or external program) lives outside it.
          </div>
        )}
      </div>
    </div>
  );
}
