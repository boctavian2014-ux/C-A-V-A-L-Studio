import { useState } from "react";
import type { CodeReviewSession } from "./types";
import { CodeReviewFile } from "./code-review-file";
import { CodeReviewHunkView } from "./code-review-hunk";

export interface CodeReviewDiffProps {
  session: CodeReviewSession;
  selectedFileId?: string;
  onSelectFile?: (fileId: string) => void;
  onAcceptFile?: (fileId: string) => void;
  onRejectFile?: (fileId: string) => void;
  onAcceptHunk?: (hunkId: string) => void;
  onRejectHunk?: (hunkId: string) => void;
  onAcceptLine?: (lineId: string) => void;
  onRejectLine?: (lineId: string) => void;
  onAddComment?: (targetId: string, text: string) => void;
}

export const CodeReviewDiff = ({
  session,
  selectedFileId,
  onSelectFile,
  onAcceptFile,
  onRejectFile,
  onAcceptHunk,
  onRejectHunk,
  onAcceptLine,
  onRejectLine,
  onAddComment
}: CodeReviewDiffProps) => {
  const [internalSelected, setInternalSelected] = useState(session.files[0]?.id);
  const activeId = selectedFileId ?? internalSelected;
  const activeFile = session.files.find((file) => file.id === activeId) ?? session.files[0];

  const selectFile = (fileId: string) => {
    setInternalSelected(fileId);
    onSelectFile?.(fileId);
  };

  return (
    <div className="caval-review-diff">
      <aside className="caval-review-diff__files">
        {session.files.map((file) => (
          <CodeReviewFile
            key={file.id}
            file={file}
            selected={file.id === activeFile?.id}
            onSelect={selectFile}
            onAcceptFile={onAcceptFile}
            onRejectFile={onRejectFile}
          />
        ))}
      </aside>
      <div className="caval-review-diff__viewer caval-review-diff__viewer--ai-glow">
        {activeFile ? (
          activeFile.hunks.map((hunk) => (
            <CodeReviewHunkView
              key={hunk.id}
              hunk={hunk}
              comments={session.comments}
              onAcceptHunk={onAcceptHunk}
              onRejectHunk={onRejectHunk}
              onAcceptLine={onAcceptLine}
              onRejectLine={onRejectLine}
              onAddComment={onAddComment}
            />
          ))
        ) : (
          <p className="caval-review-diff__empty">Select a file to review its diff.</p>
        )}
      </div>
    </div>
  );
};
