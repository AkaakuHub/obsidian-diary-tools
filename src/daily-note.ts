export interface DailyNoteProjection {
  carryoverContent: string;
  sourceContent: string;
}

type TodoStatus = "cancelled" | "done" | "pending";

interface TodoNode {
  children: TodoNode[];
  status: TodoStatus;
  indent: number;
  keepInCarryover: boolean;
  keepInSource: boolean;
}

const TODO_LINE_PATTERN = /^([ \t]*)[-*+]\s+\[([ xX-])\](.*)$/u;

export function projectDailyNote(content: string): DailyNoteProjection {
  const lines = content.split(/\r?\n/u);
  const taskNodes = parseTaskNodes(lines);
  const sourceLines = lines.filter(
    (_, index) => !taskNodes.has(index) || Boolean(taskNodes.get(index)?.keepInSource),
  );
  const carryoverLines = lines.filter((_, index) => Boolean(taskNodes.get(index)?.keepInCarryover));

  return {
    carryoverContent: carryoverLines.join("\n"),
    sourceContent: sourceLines.join("\n"),
  };
}

export function composeDailyNote(templateContent: string, carryoverContent: string): string {
  const carryover = carryoverContent.trim();
  if (!carryover) {
    return templateContent;
  }

  const template = templateContent.trimEnd();
  return template ? `${template}\n\n${carryover}\n` : `${carryover}\n`;
}

function parseTaskNodes(lines: string[]): Map<number, TodoNode> {
  const nodes = new Map<number, TodoNode>();
  const roots: TodoNode[] = [];
  const stack: TodoNode[] = [];

  lines.forEach((line, lineNumber) => {
    const match = TODO_LINE_PATTERN.exec(line);
    if (!match) {
      return;
    }

    const node: TodoNode = {
      children: [],
      status: getTodoStatus(match[2]),
      indent: match[1].length,
      keepInCarryover: false,
      keepInSource: false,
    };
    nodes.set(lineNumber, node);

    while (stack.length > 0 && stack[stack.length - 1].indent >= node.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });

  roots.forEach(evaluateNode);
  return nodes;
}

function evaluateNode(node: TodoNode): void {
  node.children.forEach(evaluateNode);
  node.keepInSource =
    node.status !== "pending" || node.children.some((child) => child.keepInSource);
  node.keepInCarryover =
    node.status === "pending" || node.children.some((child) => child.keepInCarryover);
}

function getTodoStatus(marker: string): TodoStatus {
  if (marker === "x" || marker === "X") {
    return "done";
  }
  if (marker === "-") {
    return "cancelled";
  }
  return "pending";
}
