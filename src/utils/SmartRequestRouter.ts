import { getEmbedding } from './aiService';
import type { AIProvider } from './aiService';

// --- CONFIGURATION SYSTEM ---
export interface RouterConfig {
  enabled: boolean;
  exactCacheEnabled: boolean;
  semanticCacheEnabled: boolean;
  localIntentsEnabled: boolean;
  analyticsEnabled: boolean;
  similarityThreshold: number; // e.g. 0.96 for 96% semantic confidence
}

export const ROUTER_CONFIG: RouterConfig = {
  enabled: true,
  exactCacheEnabled: true,
  semanticCacheEnabled: true,
  localIntentsEnabled: true,
  analyticsEnabled: true,
  similarityThreshold: 0.96,
};

// --- ANALYTICS SYSTEM ---
export interface RouterAnalytics {
  totalMessages: number;
  geminiRequests: number;
  localResponses: number;
  exactCacheHits: number;
  semanticCacheHits: number;
  apiRequestsSaved: number;
  estimatedTokenSavings: number;
  averageResponseTime: number;
}

export const getRouterAnalytics = (): RouterAnalytics => {
  const saved = localStorage.getItem('gemvora_router_analytics');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      // fallback
    }
  }
  return {
    totalMessages: 0,
    geminiRequests: 0,
    localResponses: 0,
    exactCacheHits: 0,
    semanticCacheHits: 0,
    apiRequestsSaved: 0,
    estimatedTokenSavings: 0,
    averageResponseTime: 0,
  };
};

export const saveRouterAnalytics = (analytics: RouterAnalytics) => {
  if (!ROUTER_CONFIG.analyticsEnabled) return;
  localStorage.setItem('gemvora_router_analytics', JSON.stringify(analytics));
};

export const resetRouterAnalytics = () => {
  const fresh: RouterAnalytics = {
    totalMessages: 0,
    geminiRequests: 0,
    localResponses: 0,
    exactCacheHits: 0,
    semanticCacheHits: 0,
    apiRequestsSaved: 0,
    estimatedTokenSavings: 0,
    averageResponseTime: 0,
  };
  localStorage.setItem('gemvora_router_analytics', JSON.stringify(fresh));
};

// --- STORAGE INTERFACE & PROVIDERS ---
export interface CacheEntry {
  question: string;
  normalizedQuestion: string;
  response: string;
  timestamp: number;
  hash: string;
  embedding?: number[];
}

export interface CacheStorageProvider {
  get(normalizedQuestion: string): Promise<CacheEntry | null>;
  set(normalizedQuestion: string, entry: CacheEntry): Promise<void>;
  findSimilar(normalizedQuestion: string, embedding: number[], threshold: number): Promise<CacheEntry | null>;
  clear(): Promise<void>;
}

// Helper: Cosine similarity calculation
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

// 1. Production High-Performance IndexedDB Provider
export class IndexedDBCacheStorageProvider implements CacheStorageProvider {
  private dbName = 'Gemvora_RouterCacheDB';
  private storeName = 'router_cache';
  private version = 1;

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(new Error('Failed to open Router Cache DB'));
      request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'normalizedQuestion' });
        }
      };
    });
  }

  async get(normalizedQuestion: string): Promise<CacheEntry | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(normalizedQuestion);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async set(_normalizedQuestion: string, entry: CacheEntry): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async findSimilar(_normalizedQuestion: string, embedding: number[], threshold: number): Promise<CacheEntry | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries: CacheEntry[] = request.result || [];
        let bestMatch: CacheEntry | null = null;
        let highestSim = 0;

        for (const entry of entries) {
          if (entry.embedding && entry.embedding.length === embedding.length) {
            const sim = cosineSimilarity(embedding, entry.embedding);
            if (sim >= threshold && sim > highestSim) {
              highestSim = sim;
              bestMatch = entry;
            }
          }
        }
        resolve(bestMatch);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// 2. Development SQLite Mock Provider
export class SQLiteCacheStorageProvider implements CacheStorageProvider {
  private mockTable = new Map<string, CacheEntry>();

  async get(normalizedQuestion: string): Promise<CacheEntry | null> {
    // Simulated: SELECT * FROM router_cache WHERE normalizedQuestion = ?
    return this.mockTable.get(normalizedQuestion) || null;
  }

  async set(normalizedQuestion: string, entry: CacheEntry): Promise<void> {
    // Simulated: INSERT OR REPLACE INTO router_cache VALUES (?, ?, ?, ?, ?, ?)
    this.mockTable.set(normalizedQuestion, entry);
  }

  async findSimilar(_normalizedQuestion: string, embedding: number[], threshold: number): Promise<CacheEntry | null> {
    let bestMatch: CacheEntry | null = null;
    let highestSim = 0;

    for (const entry of this.mockTable.values()) {
      if (entry.embedding && entry.embedding.length === embedding.length) {
        const sim = cosineSimilarity(embedding, entry.embedding);
        if (sim >= threshold && sim > highestSim) {
          highestSim = sim;
          bestMatch = entry;
        }
      }
    }
    return bestMatch;
  }

  async clear(): Promise<void> {
    this.mockTable.clear();
  }
}

// Use IndexedDB provider by default
export const defaultCacheProvider = new IndexedDBCacheStorageProvider();

// --- INPUT NORMALIZATION ENGINE ---
export const normalizeInput = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')                  // collapse multiple spaces
    .replace(/([!?.])\1+/g, '$1')          // remove repeated punctuation (!!! -> !, ??? -> ?)
    .replace(/(.)\1{3,}/g, '$1$1');        // collapse repeated characters (Hiiiiiii -> Hii)
};

// --- LOCAL INTENT ENGINE ---
const LOCAL_INTENTS: Record<string, string> = {
  // Greetings
  'hi': 'Hello! How can I help you today?',
  'hello': 'Hello! How can I help you today?',
  'hey': 'Hey there! How can I help you today?',
  'hii': 'Hello! How can I assist you with your medical reports today?',
  'hiii': 'Hello! How can I assist you with your medical reports today?',
  'good morning': 'Good morning! I hope you are having a healthy day. How can I help?',
  'good evening': 'Good evening! How can I assist you tonight?',
  'good night': 'Good night! Sleep well, and let me know if you need any health report explanations tomorrow.',
  'namaste': 'Namaste! How can I assist you with your health reports today?',
  'yo': 'Yo! How can I help you today?',
  
  // Thanks
  'thanks': 'You are very welcome! Let me know if you need anything else.',
  'thank you': 'You are very welcome! Let me know if you need anything else.',
  'thx': 'You are welcome!',
  'ty': 'You are welcome!',
  'tysm': 'You are very welcome! Happy to help!',
  
  // Goodbye
  'bye': 'Goodbye! Take care of your health, and feel free to reach out anytime.',
  'goodbye': 'Goodbye! Take care of your health, and feel free to reach out anytime.',
  'see you': 'Goodbye! See you next time.',
  'take care': 'Thank you! You take care of your health too.',
  
  // Acknowledgements
  'ok': 'Understood. Let me know if you have any questions or reports to analyze.',
  'okay': 'Understood. Let me know if you have any questions or reports to analyze.',
  'kk': 'Understood.',
  'cool': 'Perfect! Let me know if you need any report explanations.',
  'nice': 'Great! Let me know if you have health questions.',
  'great': 'Great! Let me know if you have health questions.',
  'awesome': 'Awesome! Let me know if you have health questions.',
  'perfect': 'Perfect! Let me know if you need anything else.',

  // Identity / Capabilities
  'who are you': 'I am Gemvora, your advanced AI clinical assistant. You can upload medical reports or ask health-related questions, and I will explain them clearly in simple terms.',
  'your name': 'My name is Gemvora, your advanced AI clinical assistant.',
  'what can you do': 'I can help you read, translate, and explain medical reports, keep track of your patient profile memory, and answer health questions in English and Marathi.',
  'what do you do': 'I help patients understand their complex medical reports by translating them into simple terms and answering health-related queries.',
  
  // App Help
  'how to upload image': 'To upload a report image, go to the Home tab, tap "Scan" to take a photo or select an existing image. You can also upload it in the Chat tab by tapping the paperclip icon.',
  'how to upload pdf': 'To upload a PDF, go to the Home tab and tap "Upload" to select a PDF document from your device. You can also upload it in the Chat tab by tapping the paperclip icon.',
  'how do attachments work': 'You can attach photos (JPG, PNG, WEBP, HEIC) or PDF files by tapping the paperclip icon next to the chat bar. We only allow medical reports or patient health documents.'
};

export const getLocalResponse = (normalizedText: string): string | null => {
  if (LOCAL_INTENTS[normalizedText]) {
    return LOCAL_INTENTS[normalizedText];
  }
  const clean = normalizedText.replace(/[.!?]/g, '').trim();
  if (LOCAL_INTENTS[clean]) {
    return LOCAL_INTENTS[clean];
  }
  return null;
};

// --- SMART REQUEST ROUTER MAIN ENTRYPOINT ---
export interface RouteResult {
  source: 'local_intent' | 'exact_cache' | 'semantic_cache' | 'gemini_fallback';
  response: string;
  confidence: number;
  latencyMs: number;
}

export const routeMessage = async (
  text: string,
  provider: AIProvider,
  storage: CacheStorageProvider = defaultCacheProvider,
  historyLength = 0,
  hasAttachment = false
): Promise<RouteResult> => {
  const startTime = performance.now();
  const normalized = normalizeInput(text);

  const incrementAnalytics = (
    key: 'localResponses' | 'exactCacheHits' | 'semanticCacheHits' | 'geminiRequests',
    latency: number,
    tokenSaving = 0
  ) => {
    if (!ROUTER_CONFIG.analyticsEnabled) return;
    const stats = getRouterAnalytics();
    stats.totalMessages += 1;
    stats[key] += 1;
    if (key !== 'geminiRequests') {
      stats.apiRequestsSaved += 1;
      stats.estimatedTokenSavings += tokenSaving;
    }
    stats.averageResponseTime = stats.averageResponseTime === 0
      ? latency
      : stats.averageResponseTime * 0.9 + latency * 0.1;
    saveRouterAnalytics(stats);
  };

  // Strictly block router for medical, code, or context-heavy queries
  const isMedicalQuery = (t: string) => {
    const medicalKeywords = [
      'pain', 'blood', 'sugar', 'doctor', 'fever', 'medicine', 'dose', 'disease', 'cough', 
      'cancer', 'heart', 'pressure', 'report', 'scan', 'test', 'explanation', 'rxt', 'results',
      'treatment', 'remedy', 'cure', 'symptom', 'allergy', 'vaccine', 'diabetes', 'clinical',
      'वाढलेली', 'कमी', 'असामान्य', 'गंभीर', 'रुग्ण', 'औषध'
    ];
    return medicalKeywords.some(kw => t.includes(kw));
  };

  const isProgrammingOrMath = (t: string) => {
    const codeKeywords = [
      'code', 'function', 'api', 'javascript', 'typescript', 'react', 'css', 'html', 'python',
      'math', 'equation', 'sum', 'multiply', 'divide', 'calculate', 'solve', 'reasoning'
    ];
    return codeKeywords.some(kw => t.includes(kw));
  };

  const isInstructionQuery = (t: string) => {
    const helpKeywords = ['upload', 'attachment', 'pdf', 'image', 'photo', 'work'];
    const isHowTo = t.includes('how to') || t.includes('how do') || t.includes('help');
    return isHowTo && !helpKeywords.some(kw => t.includes(kw));
  };

  const containsQuestionWord = (t: string) => {
    const questionWords = ['why', 'what', 'who', 'where', 'when', 'explain', 'summarize', 'translate', 'meaning'];
    const staticAllowed = [
      'who are you', 'your name', 'what can you do', 'what do you do', 
      'how to upload image', 'how to upload pdf', 'how do attachments work'
    ];
    const isStatic = staticAllowed.some(s => t.includes(s));
    return questionWords.some(qw => t.includes(qw)) && !isStatic;
  };

  const bypassRouter =
    !ROUTER_CONFIG.enabled ||
    historyLength > 0 ||                // Thread has active context
    hasAttachment ||                    // Query has PDF/Image attachment
    text.length > 50 ||                 // Long prompt details
    isMedicalQuery(normalized) ||
    isProgrammingOrMath(normalized) ||
    isInstructionQuery(normalized) ||
    containsQuestionWord(normalized);

  if (bypassRouter) {
    const latency = performance.now() - startTime;
    return {
      source: 'gemini_fallback',
      response: '',
      confidence: 0,
      latencyMs: latency
    };
  }

  // 1. Local Intent Matching
  if (ROUTER_CONFIG.localIntentsEnabled) {
    const localResponse = getLocalResponse(normalized);
    if (localResponse) {
      const latency = performance.now() - startTime;
      incrementAnalytics('localResponses', latency, 45);
      return {
        source: 'local_intent',
        response: localResponse,
        confidence: 1.0,
        latencyMs: latency
      };
    }
  }

  // 2. Exact Match Cache lookup
  if (ROUTER_CONFIG.exactCacheEnabled) {
    try {
      const exactMatch = await storage.get(normalized);
      if (exactMatch) {
        const latency = performance.now() - startTime;
        incrementAnalytics('exactCacheHits', latency, 200);
        return {
          source: 'exact_cache',
          response: exactMatch.response,
          confidence: 1.0,
          latencyMs: latency
        };
      }
    } catch (e) {
      console.warn('Exact cache get failed:', e);
    }
  }

  // 3. Semantic Similarity Cache lookup
  if (ROUTER_CONFIG.semanticCacheEnabled) {
    try {
      const embedding = await getEmbedding(normalized, provider);
      const semanticMatch = await storage.findSimilar(normalized, embedding, ROUTER_CONFIG.similarityThreshold);
      if (semanticMatch) {
        const latency = performance.now() - startTime;
        incrementAnalytics('semanticCacheHits', latency, 200);
        return {
          source: 'semantic_cache',
          response: semanticMatch.response,
          confidence: 0.98,
          latencyMs: latency
        };
      }
    } catch (e) {
      console.warn('Semantic cache similarity check failed:', e);
    }
  }

  const latency = performance.now() - startTime;
  return {
    source: 'gemini_fallback',
    response: '',
    confidence: 0,
    latencyMs: latency
  };
};

export const saveToCache = async (
  originalQuestion: string,
  aiResponse: string,
  provider: AIProvider,
  storage: CacheStorageProvider = defaultCacheProvider
): Promise<void> => {
  if (!ROUTER_CONFIG.enabled || (!ROUTER_CONFIG.exactCacheEnabled && !ROUTER_CONFIG.semanticCacheEnabled)) return;
  
  const normalized = normalizeInput(originalQuestion);
  const hash = 'h_' + Math.random().toString(36).substring(2, 10);
  
  let embedding: number[] | undefined = undefined;
  if (ROUTER_CONFIG.semanticCacheEnabled) {
    try {
      embedding = await getEmbedding(normalized, provider);
    } catch (e) {
      console.warn('Failed to pre-compute embedding for cache:', e);
    }
  }

  const entry: CacheEntry = {
    question: originalQuestion,
    normalizedQuestion: normalized,
    response: aiResponse,
    timestamp: Date.now(),
    hash,
    embedding,
  };

  try {
    await storage.set(normalized, entry);
  } catch (e) {
    console.error('Failed to store cache entry:', e);
  }
};

export const runRouterSelfTests = async (): Promise<void> => {
  console.log("=== RUNNING SMART ROUTER SELF-TESTS ===");
  try {
    // 1. Test normalization
    const norm1 = normalizeInput("Hiiii!!!");
    if (norm1 !== "hii!") throw new Error(`Normalize failed for 'Hiiii!!!'. Got: ${norm1}`);
    
    const norm2 = normalizeInput("  hello   world  ");
    if (norm2 !== "hello world") throw new Error(`Normalize failed for spaces. Got: ${norm2}`);

    // 2. Test local intent mappings
    const resp1 = getLocalResponse("hi");
    if (!resp1) throw new Error("Local greeting intent hi failed");
    
    const resp2 = getLocalResponse("who are you");
    if (!resp2) throw new Error("Local identity intent failed");

    // 3. Test custom storage mock provider
    const mockDb = new SQLiteCacheStorageProvider();
    await mockDb.set("test_q", {
      question: "Test Q",
      normalizedQuestion: "test_q",
      response: "Test Resp",
      timestamp: Date.now(),
      hash: "test_h",
      embedding: [1, 0, 0]
    });

    const getCached = await mockDb.get("test_q");
    if (getCached?.response !== "Test Resp") throw new Error("Exact match cache store/get failed");

    const similar = await mockDb.findSimilar("test_q", [1, 0, 0], 0.95);
    if (similar?.response !== "Test Resp") throw new Error("Semantic match cache search failed");

    console.log("=== ALL ROUTER SELF-TESTS PASSED SUCCESSFULLY ===");
  } catch (err: any) {
    console.error("SMART ROUTER SELF-TEST FAILED:", err);
    throw err;
  }
};
