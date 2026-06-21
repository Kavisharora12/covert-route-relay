export interface IngestedFile {
  id: string;
  filename: string;
  content: string;
  receivedAt: string;
  sizeBytes: number;
}

const store: IngestedFile[] = [];
const MAX_ENTRIES = 50;

export function addEntry(entry: Omit<IngestedFile, "id" | "receivedAt">): IngestedFile {
  const record: IngestedFile = {
    id: Math.random().toString(36).slice(2),
    receivedAt: new Date().toISOString(),
    ...entry,
  };
  store.unshift(record);
  if (store.length > MAX_ENTRIES) store.length = MAX_ENTRIES;
  return record;
}

export function getEntries(): IngestedFile[] {
  return store;
}

export function deleteEntry(id: string): boolean {
  const idx = store.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}

export function clearEntries(): void {
  store.length = 0;
}
