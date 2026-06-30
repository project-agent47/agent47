export interface ObjectStorage {
  put(key: string, content: string | Buffer): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}
