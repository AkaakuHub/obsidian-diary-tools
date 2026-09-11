export interface DailyNoteProjection {
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
  carryoverIndentation: string;
  children: TodoNode[];
  indentation: string;
  status: TodoStatus;
  keepInCarryover: boolean;
  keepInSource: boolean;
}

interface TaskProjection {
  carryoverContent: string;
  sourceContent: string;
}

const TODO_LINE_PATTERN = /^([ \t]*)[-*+]\s+\[([ xX-])\](.*)$/u;
const TEMPLATE_MARKERS = ["<!-- diary -->", "<!-- todo-today -->", "<!-- todo -->"] as const;

export function projectDailyNote(content: string): DailyNoteProjection {
  const lines = content.split(/\r?\n/u);

  return {
    sourceContent: projectSourceContent(lines),
    sections: projectSections(lines),
  };
}

export function composeDailyNote(templateContent: string, projection: DailyNoteProjection): string {
  validateTemplateMarkers(templateContent);
  return templateContent
    .replace("<!-- diary -->", projection.sections.diary)
    .replace("<!-- todo-today -->", projection.sections.todoToday)
    .replace("<!-- todo -->", projection.sections.todo);
}

function validateTemplateMarkers(templateContent: string): void {
  for (const marker of TEMPLATE_MARKERS) {
    const markerCount = templateContent.split(marker).length - 1;
    if (markerCount !== 1) {
      throw new Error(`テンプレートには${marker}を1つだけ配置してください。`);
    }
  }
}

function projectSourceContent(lines: string[]): string {
  const sourceLines: string[] = [];
  let currentSection: TodoSectionKey | null = null;
  let sectionStart = 0;

  for (let index = 0; index <= lines.length; index += 1) {
    const heading = index < lines.length ? getHeading(lines[index]) : null;
    if (index < lines.length && heading === null) {
      continue;
    }

    const sectionLines = lines.slice(sectionStart, index);
    sourceLines.push(...(currentSection ? projectTaskSourceLines(sectionLines) : sectionLines));
    if (index < lines.length) {
      sourceLines.push(lines[index]);
      currentSection = getSectionKey(heading ?? "");
      sectionStart = index + 1;
    }
  }

  return sourceLines.join("\n");
}

function projectTaskLines(lines: string[]): TaskProjection {
  const taskNodes = parseTaskNodes(lines);
  const sourceLines = projectTaskSourceLines(lines, taskNodes);
  const carryoverLines = getCarryoverLines(lines, taskNodes);

  return {
    carryoverContent: carryoverLines.join("\n"),
    sourceContent: sourceLines.join("\n"),
  };
}

function projectTaskSourceLines(lines: string[], taskNodes = parseTaskNodes(lines)): string[] {
  return lines.flatMap((line, index) => {
    const taskNode = taskNodes.get(index);
    if (taskNode && !taskNode.keepInSource) {
      return [];
    }
    if (taskNode && shouldMarkSourceTaskComplete(taskNode)) {
      return [markTaskComplete(line)];
    }
    return [line];
  });
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

  return lines.flatMap((line, index) => {
    const taskNode = taskNodes.get(index);
    if (taskNode?.keepInCarryover) {
      return [`${taskNode.carryoverIndentation}${line.slice(taskNode.indentation.length)}`];
    }
    if (line.trim() === "" && hasCarryoverBefore[index] && hasCarryoverAfter[index]) {
      return [line];
    }
    return [];
  });
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
    const heading = getHeading(line);
    if (heading !== null) {
      currentSection = getSectionKey(heading);
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

function getHeading(line: string): string | null {
  return /^#\s+(.+?)\s*$/u.exec(line)?.[1] ?? null;
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
      carryoverIndentation: match[1],
      children: [],
      indentation: match[1],
      status: getTodoStatus(match[2]),
      keepInCarryover: false,
      keepInSource: false,
    };
    nodes.set(lineNumber, node);

    while (
      stack.length > 0 &&
      stack[stack.length - 1].indentation.length >= node.indentation.length
    ) {
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
  roots.forEach((root) =>
    assignCarryoverIndentation(root, null, root.indentation, root.indentation),
  );
  return nodes;
}

function evaluateNode(node: TodoNode): void {
  node.children.forEach(evaluateNode);
  node.keepInSource =
    node.status !== "pending" || node.children.some((child) => child.keepInSource);
  node.keepInCarryover = node.status === "pending";
}

function assignCarryoverIndentation(
  node: TodoNode,
  carriedAncestor: TodoNode | null,
  rootIndentation: string,
  parentIndentation: string,
): void {
  let nextCarriedAncestor = carriedAncestor;
  if (node.keepInCarryover) {
    node.carryoverIndentation = carriedAncestor
      ? `${carriedAncestor.carryoverIndentation}${node.indentation.slice(parentIndentation.length)}`
      : rootIndentation;
    nextCarriedAncestor = node;
  }
  node.children.forEach((child) =>
    assignCarryoverIndentation(child, nextCarriedAncestor, rootIndentation, node.indentation),
  );
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
