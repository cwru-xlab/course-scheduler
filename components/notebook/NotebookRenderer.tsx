"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { MarkdownCell } from "./MarkdownCell";
import { CodeCell } from "./CodeCell";

// Utility function to extract incorrect cells with context
export function extractIncorrectCells(
  notebook: NotebookData,
  cellsBeforeCount: number = 2,
  cellsAfterCount: number = 2
) {
  const incorrectCells: Array<{
    incorrectCell: NotebookCell;
    cellIndex: number;
    beforeCells: NotebookCell[];
    afterCells: NotebookCell[];
  }> = [];

  notebook.cells.forEach((cell, index) => {
    if (cell.metadata?.is_incorrect === true) {
      const beforeStart = Math.max(0, index - cellsBeforeCount);
      const afterEnd = Math.min(notebook.cells.length, index + cellsAfterCount + 1);
      
      incorrectCells.push({
        incorrectCell: cell,
        cellIndex: index,
        beforeCells: notebook.cells.slice(beforeStart, index),
        afterCells: notebook.cells.slice(index + 1, afterEnd),
      });
    }
  });

  return incorrectCells;
}

interface NotebookCell {
  cell_type: "markdown" | "code" | "raw";
  source: string[];
  execution_count?: number | null;
  metadata?: Record<string, any>;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata?: Record<string, any>;
  nbformat?: number;
  nbformat_minor?: number;
}

interface NotebookRendererProps {
  notebookPath: string;
  onNotebookLoaded?: (notebook: NotebookData) => void;
  onCellSelect?: (cellIndex: number) => void;
  selectedCellIndex?: number | null;
}

export const NotebookRenderer = ({ 
  notebookPath, 
  onNotebookLoaded,
  onCellSelect,
  selectedCellIndex 
}: NotebookRendererProps) => {
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotebook = async () => {
      try {
        setLoading(true);
        const response = await fetch(notebookPath);
        if (!response.ok) {
          throw new Error(`Failed to load notebook: ${response.statusText}`);
        }
        const data = await response.json();
        setNotebook(data);
        setError(null);
        if (onNotebookLoaded) {
          onNotebookLoaded(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notebook");
      } finally {
        setLoading(false);
      }
    };

    fetchNotebook();
  }, [notebookPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Spinner size="lg" label="Loading notebook..." />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="m-4">
        <CardBody>
          <div className="text-danger">
            <h3 className="text-lg font-semibold mb-2">Error Loading Notebook</h3>
            <p>{error}</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!notebook || !notebook.cells) {
    return (
      <Card className="m-4">
        <CardBody>
          <p className="text-default-500">No notebook data available</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="p-4 pb-8">
      <div className="max-w-4xl">
        {notebook.cells.map((cell, index) => {
          if (cell.cell_type === "markdown") {
            return (
              <MarkdownCell 
                key={index} 
                source={cell.source}
                isSelected={selectedCellIndex === index}
                onClick={() => {
                  if (onCellSelect) {
                    onCellSelect(index);
                  }
                }}
              />
            );
          } else if (cell.cell_type === "code") {
            return (
              <CodeCell
                key={index}
                source={cell.source}
                executionCount={cell.execution_count}
                metadata={cell.metadata}
                isSelected={selectedCellIndex === index}
                onClick={() => {
                  if (onCellSelect) {
                    onCellSelect(index);
                  }
                }}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

