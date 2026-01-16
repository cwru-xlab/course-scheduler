"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { NotebookRenderer } from "@/components/notebook/NotebookRenderer";
import { ChatBox } from "@/components/chat/ChatBox";
import { NotebookData } from "@/lib/llm/types";

interface NotebookPageProps {
  cellsBeforeCount?: number;
  cellsAfterCount?: number;
}

export default function NotebookPage({
  cellsBeforeCount = 2,
  cellsAfterCount = 2,
}: NotebookPageProps = {}) {
  const params = useParams();
  const notebookId = params?.notebookId as string;
  
  const [notebookData, setNotebookData] = useState<NotebookData | null>(null);
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  const handleNotebookLoaded = (notebook: NotebookData) => {
    setNotebookData(notebook);
  };

  const handleCellSelect = (cellIndex: number) => {
    // Toggle: if clicking the same cell, deselect it
    setSelectedCellIndex(prev => prev === cellIndex ? null : cellIndex);
  };

  // Auto-select first incorrect cell on initial load only
  useEffect(() => {
    if (notebookData && !hasAutoSelected) {
      const firstIncorrectIndex = notebookData.cells.findIndex(
        cell => cell.metadata?.is_incorrect === true
      );
      if (firstIncorrectIndex !== -1) {
        setSelectedCellIndex(firstIncorrectIndex);
      }
      setHasAutoSelected(true);
    }
  }, [notebookData, hasAutoSelected]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left side - Notebook Viewer (scrollable) */}
        <div className="w-full">
          <NotebookRenderer 
            notebookPath={`/api/notebooks/${notebookId}`}
            onNotebookLoaded={handleNotebookLoaded}
            onCellSelect={handleCellSelect}
            selectedCellIndex={selectedCellIndex}
          />
        </div>
        
        {/* Right side - Chat Box (sticky) */}
        <div className="w-full">
          <div className="sticky top-20 h-[calc(100vh-8rem)]">
            <ChatBox 
              notebookData={notebookData}
              selectedCellIndex={selectedCellIndex}
              notebookId={notebookId}
              cellsBeforeCount={cellsBeforeCount}
              cellsAfterCount={cellsAfterCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

