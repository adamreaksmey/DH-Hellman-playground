const store = new Map<string, string>();

export const storage = {
  setItem(key: string, value: string): void {
    store.set(key, value);
  },

  getItem(key: string): string | null {
    return store.get(key) ?? null;
  },

  removeItem(key: string): void {
    store.delete(key);
  },

  clear(): void {
    store.clear();
  },

  get length(): number {
    return store.size;
  },

  key(index: number): string | null {
    return [...store.keys()][index] ?? null;
  },
};
