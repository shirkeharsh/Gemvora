import { postLog } from './aiService';

export interface ReportChunk {
  id?: number;
  username: string;
  reportId: string;
  text: string;
  embedding?: number[];
  timestamp: number;
}

const DB_NAME = 'Gemvora_LocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'report_chunks';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event);
      reject(new Error('Failed to open local database'));
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('username', 'username', { unique: false });
        store.createIndex('reportId', 'reportId', { unique: false });
        store.createIndex('user_report', ['username', 'reportId'], { unique: false });
      }
    };
  });
};

export const saveChunks = async (
  username: string,
  reportId: string,
  chunks: { text: string; embedding?: number[] }[]
): Promise<void> => {
  await postLog('info', `Saving ${chunks.length} chunks to local DB for user ${username}, report ${reportId}`);
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = (event) => {
      console.error('Transaction error saving chunks:', event);
      reject(new Error('Failed to save report chunks to local DB'));
    };

    const timestamp = Date.now();
    for (const chunk of chunks) {
      const data: ReportChunk = {
        username,
        reportId,
        text: chunk.text,
        embedding: chunk.embedding,
        timestamp,
      };
      store.add(data);
    }
  });
};

export const getChunksByReport = async (username: string, reportId: string): Promise<ReportChunk[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('user_report');
    const query = index.getAll([username, reportId]);

    query.onsuccess = () => {
      resolve(query.result);
    };

    query.onerror = (event) => {
      console.error('Error fetching chunks:', event);
      reject(new Error('Failed to load chunks from local DB'));
    };
  });
};

// Cosine similarity between two vectors
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Keyword similarity fallback (Jaccard-like or term intersection)
const keywordSimilarity = (textA: string, textB: string): number => {
  const wordsA = new Set(textA.toLowerCase().match(/\w+/g) || []);
  const wordsB = new Set(textB.toLowerCase().match(/\w+/g) || []);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
};

export const queryChunksRAG = async (
  username: string,
  reportId: string,
  queryText: string,
  queryEmbedding?: number[],
  limit = 4
): Promise<ReportChunk[]> => {
  await postLog('info', `Running local DB RAG query for user: ${username}, query: "${queryText.substring(0, 50)}..."`);
  const chunks = await getChunksByReport(username, reportId);
  if (chunks.length === 0) return [];

  interface ScoredChunk {
    chunk: ReportChunk;
    score: number;
  }

  const scored: ScoredChunk[] = chunks.map((chunk) => {
    let score = 0;
    if (queryEmbedding && chunk.embedding && chunk.embedding.length === queryEmbedding.length) {
      score = cosineSimilarity(queryEmbedding, chunk.embedding);
    } else {
      // Fallback keyword-based matching
      score = keywordSimilarity(queryText, chunk.text);
    }
    return { chunk, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Log the matches for logging server validation
  const topScores = scored.slice(0, limit).map(s => `${s.score.toFixed(4)}`).join(', ');
  await postLog('info', `RAG matching done. Top ${limit} scores: [${topScores}]`);

  return scored.slice(0, limit).map((s) => s.chunk);
};

export const clearUserChunks = async (username: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('username');
    const cursorRequest = index.openCursor(IDBKeyRange.only(username));

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };

    cursorRequest.onerror = (event) => {
      console.error('Error clearing chunks:', event);
      reject(new Error('Failed to clear user chunks'));
    };
  });
};
