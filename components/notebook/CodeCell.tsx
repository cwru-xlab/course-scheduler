"use client";

import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/themes/prism-tomorrow.css";

interface CodeCellProps {
  source: string[];
  language?: string;
  executionCount?: number | null;
  metadata?: {
    is_incorrect?: boolean;
    [key: string]: any;
  };
  isSelected?: boolean;
  onClick?: () => void;
}

export const CodeCell = ({
  source,
  language = "python",
  executionCount,
  metadata,
  isSelected = false,
  onClick,
}: CodeCellProps) => {
  const [code, setCode] = useState("");

  useEffect(() => {
    const content = Array.isArray(source) ? source.join("") : source;
    setCode(content);
  }, [source]);

  const highlight = (code: string) => {
    return Prism.highlight(code, Prism.languages[language] || Prism.languages.python, language);
  };

  const isIncorrect = metadata?.is_incorrect === true;
  const isClickable = !!onClick;

  return (
    <Card 
      className={`w-full mb-4 transition-all ${
        isSelected 
          ? "border-4 border-primary shadow-lg" 
          : isIncorrect 
          ? "border-2 border-danger" 
          : ""
      } ${isClickable ? "cursor-pointer hover:shadow-md" : ""}`}
      isPressable={isClickable}
      onPress={onClick}
    >
      <CardHeader className="flex gap-3">
        <Chip color="primary" variant="flat" size="sm">
          {executionCount !== null && executionCount !== undefined
            ? `[${executionCount}]`
            : "[ ]"}
        </Chip>
        <span className="text-sm text-default-500">{language}</span>
        {isIncorrect && (
          <Chip color="danger" variant="flat" size="sm">
            Incorrect
          </Chip>
        )}
        {isSelected && (
          <Chip color="primary" variant="solid" size="sm">
            Selected
          </Chip>
        )}
      </CardHeader>
      <CardBody>
        <div className="font-mono text-sm">
          <Editor
            value={code}
            onValueChange={setCode}
            highlight={highlight}
            padding={10}
            readOnly
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              backgroundColor: "transparent",
            }}
            textareaClassName="focus:outline-none"
          />
        </div>
      </CardBody>
    </Card>
  );
};

