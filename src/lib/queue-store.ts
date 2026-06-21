export type FileOperation = "read" | "write" | "delete" | "sysinfo" | "env" | "list";

export interface FileRequest {
  id: string;
  path: string;
  operation: FileOperation;
  content?: string;
  keys?: string[];
  requestedAt: string;
  status: "pending" | "done" | "error";
  result?: string;
}

const queue: FileRequest[] = [];

export function enqueue(
  path: string,
  operation: FileOperation,
  content?: string,
  keys?: string[]
): FileRequest {
  const req: FileRequest = {
    id: Math.random().toString(36).slice(2),
    path,
    operation,
    content,
    keys,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };
  queue.unshift(req);
  if (queue.length > 50) queue.length = 50;
  return req;
}

export function getPending(): FileRequest[] {
  return queue.filter((r) => r.status === "pending");
}

export function getAll(): FileRequest[] {
  return queue;
}

export function markDone(id: string, result?: string): boolean {
  const r = queue.find((x) => x.id === id);
  if (!r) return false;
  r.status = "done";
  r.result = result;
  return true;
}

export function markError(id: string, result?: string): boolean {
  const r = queue.find((x) => x.id === id);
  if (!r) return false;
  r.status = "error";
  r.result = result;
  return true;
}

export function clearAll(): void {
  queue.length = 0;
}
