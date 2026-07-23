/**
 * LRU cache mimicking electron-store's embedding cache behaviour.
 * Max entries, FIFO-evicts the oldest accessed entry when full.
 */
export class LRUCache {
  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const entry = this.map.get(key);
    // refresh access order by re-inserting
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    // evict oldest (first) if full
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key) {
    return this.map.has(key);
  }

  get size() {
    return this.map.size;
  }

  keys() {
    return [...this.map.keys()];
  }

  values() {
    return [...this.map.values()];
  }

  entries() {
    return [...this.map.entries()];
  }

  clear() {
    this.map.clear();
  }
}

export default LRUCache;
