"use client";

import ReactMarkdown from "react-markdown";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";

interface MarkdownCellProps {
  source: string[];
  isSelected?: boolean;
  onClick?: () => void;
}

export const MarkdownCell = ({ source, isSelected = false, onClick }: MarkdownCellProps) => {
  const content = Array.isArray(source) ? source.join("") : source;
  const isClickable = !!onClick;

  return (
    <Card 
      className={`w-full mb-4 transition-all ${
        isSelected 
          ? "border-4 border-primary shadow-lg" 
          : ""
      } ${isClickable ? "cursor-pointer hover:shadow-md" : ""}`}
      isPressable={isClickable}
      onPress={onClick}
    >
      <CardBody>
        {isSelected && (
          <div className="mb-2">
            <Chip color="primary" variant="solid" size="sm">
              Selected
            </Chip>
          </div>
        )}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </CardBody>
    </Card>
  );
};
