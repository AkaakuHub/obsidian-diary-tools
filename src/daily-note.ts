export interface DailyNoteProjection {
  carryoverContent: string;
  sourceContent: string;
  sections: DailyNoteSections;
}

export interface DailyNoteSections {
  diary: string;
  todo: string;
  todoToday: string;
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
  const projection = projectTaskLines(lines);

  return {
    ...projection,
    sections: projectSections(lines),
  };
}

export function composeDailyNote(templateContent: string, projection: DailyNoteProjection): string {
  return templateContent
    .replaceAll("<!-- diary -->", projection.sections.diary)
    .replaceAll("<!-- todo-today -->", projection.sections.todoToday)
    .replaceAll("<!-- todo -->", projection.sections.todo);
}

function projectTaskLines(lines: string[]): Omit<DailyNoteProjection, "sections"> {
  const taskNodes = parseTaskNodes(lines);
  const sourceLines = lines.flatMap((line, index) => {
    const taskNode = taskNodes.get(index);
    if (taskNode && !taskNode.keepInSource) {
      return [];
    }
    if (taskNode && shouldMarkSourceTaskComplete(taskNode)) {
      return [markTaskComplete(line)];
    }
    return [line];
  });
  const carryoverLines = getCarryoverLines(lines, taskNodes);

  return {
    carryoverContent: carryoverLines.join("\n"),
    sourceContent: sourceLines.join("\n"),
  };
}

function shouldMarkSourceTaskComplete(taskNode: TodoNode): boolean {
  return taskNode.status === "pending" && taskNode.keepInSource && taskNode.keepInCarryover;
}

function markTaskComplete(line: string): string {
  return line.replace(/^([ \t]*[-*+]\s+\[)[ xX-](\])/u, "$1x$2");
}

function getCarryoverLines(lines: string[], taskNodes: Map<number, TodoNode>): string[] {
  const carryoverFlags = lines.map((_, index) => Boolean(taskNodes.get(index)?.keepInCarryover));
  const hasCarryoverBefore = Array.from({ length: lines.length }, () => false);
  const hasCarryoverAfter = Array.from({ length: lines.length }, () => false);

  let carryoverBefore = false;
  for (let index = 0; index < lines.length; index += 1) {
    hasCarryoverBefore[index] = carryoverBefore;
    carryoverBefore ||= carryoverFlags[index];
  }

  let carryoverAfter = false;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    hasCarryoverAfter[index] = carryoverAfter;
    carryoverAfter ||= carryoverFlags[index];
  }

  return lines.filter(
    (line, index) =>
      carryoverFlags[index] ||
      (line.trim() === "" && hasCarryoverBefore[index] && hasCarryoverAfter[index]),
  );
}

function projectSections(lines: string[]): DailyNoteSections {
  const sections = extractSections(lines);
  return {
    diary: "",
    todo: projectTaskLines(sections.todo.split(/\r?\n/u)).carryoverContent.trim(),
    todoToday: projectTaskLines(sections.todoToday.split(/\r?\n/u)).carryoverContent.trim(),
  };
}

type TodoSectionKey = "todo" | "todoToday";

function extractSections(lines: string[]): Record<TodoSectionKey, string> {
  const sectionLines: Record<TodoSectionKey, string[]> = {
    todo: [],
    todoToday: [],
  };
  let currentSection: TodoSectionKey | null = null;

  lines.forEach((line) => {
    const heading = /^(#)\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      currentSection = getSectionKey(heading[2]);
      return;
    }
    if (currentSection) {
      sectionLines[currentSection].push(line);
    }
  });

  return {
    todo: sectionLines.todo.join("\n"),
    todoToday: sectionLines.todoToday.join("\n"),
  };
}

function getSectionKey(heading: string): TodoSectionKey | null {
  const normalizedHeading = heading.trim().replaceAll(/\s+/gu, "");
  if (normalizedHeading === "絶対今日" || normalizedHeading === "絶対に今日") {
    return "todoToday";
  }
  if (normalizedHeading.toUpperCase() === "TODO") {
    return "todo";
  }
  return null;
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
