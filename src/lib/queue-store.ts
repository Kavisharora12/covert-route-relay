export interface FileRequest {
  id: string;
  path: string;
  requestedAt: string;
  status: "pending" | "done" | "error";
}

const queue: FileRequest[] = [];

export function enqueue(path: string): FileRequest {
  const req: FileRequest = {
    id: Math.random().toString(36).slice(2),
    path,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };
  queue.unshift(req);
  if (queue.length > 20) queue.length = 20;
  return req;
}

export function getPending(): FileRequest[] {
  return queue.filter((r) => r.status === "pending");
}

export function getAll(): FileRequest[] {
  return queue;
}

export function markDone(id: string): boolean {
  const r = queue.find((x) => x.id === id);
  if (!r) return false;
  r.status = "done";
  return true;
}

export function markError(id: string): boolean {
  const r = queue.find((x) => x.id === id);
  if (!r) return false;
  r.status = "error";
  return true;
}

export function clearAll(): void {
  queue.length = 0;
}
