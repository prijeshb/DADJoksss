import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers — minimal SW environment shim
// ---------------------------------------------------------------------------

type Listener = (event: unknown) => void;

interface MockCache {
  store: Map<string, Response>;
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  addAll: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
}

function makeMockCache(): MockCache {
  const store = new Map<string, Response>();
  return {
    store,
    put: vi.fn((req: Request, res: Response) => {
      store.set(req.url ?? req, res);
      return Promise.resolve();
    }),
    match: vi.fn((req: Request | string) => {
      const key = typeof req === "string" ? req : req.url;
      return Promise.resolve(store.get(key));
    }),
    addAll: vi.fn(() => Promise.resolve()),
    keys: vi.fn(() => Promise.resolve([...store.keys()])),
  };
}

interface SwEnv {
  listeners: Record<string, Listener[]>;
  caches: {
    store: Map<string, MockCache>;
    open: ReturnType<typeof vi.fn>;
    keys: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    match: ReturnType<typeof vi.fn>;
  };
  skipWaiting: ReturnType<typeof vi.fn>;
  clients: { claim: ReturnType<typeof vi.fn> };
  fetch: ReturnType<typeof vi.fn>;
  /** Execute the embedded SW string in this environment */
  run: (script: string) => void;
  /** Dispatch a synthetic SW event and return the respondWith promise if any */
  dispatch: (type: string, data?: Partial<FetchEvent>) => Promise<Response | undefined>;
}

function createSwEnv(): SwEnv {
  const cacheStore = new Map<string, MockCache>();
  const listeners: Record<string, Listener[]> = {};

  const caches = {
    store: cacheStore,
    open: vi.fn((name: string) => {
      if (!cacheStore.has(name)) cacheStore.set(name, makeMockCache());
      return Promise.resolve(cacheStore.get(name));
    }),
    keys: vi.fn(() => Promise.resolve([...cacheStore.keys()])),
    delete: vi.fn((name: string) => {
      cacheStore.delete(name);
      return Promise.resolve(true);
    }),
    match: vi.fn((req: Request) => {
      for (const cache of cacheStore.values()) {
        const hit = cache.store.get(req.url ?? req);
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(undefined);
    }),
  };

  const self_: Record<string, unknown> = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(fn);
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
    caches,
  };

  const fetchMock = vi.fn();

  function run(script: string) {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "self",
      "caches",
      "fetch",
      "URL",
      "Response",
      "Request",
      `with(self) { ${script} }`
    );
    fn(self_, caches, fetchMock, URL, Response, Request);
  }

  async function dispatch(
    type: string,
    data: Partial<FetchEvent> = {}
  ): Promise<Response | undefined> {
    let respondWithPromise: Promise<Response> | undefined;

    const event = {
      ...data,
      waitUntil: vi.fn((p: Promise<unknown>) => p),
      respondWith: vi.fn((p: Promise<Response>) => {
        respondWithPromise = p;
      }),
    };

    for (const fn of listeners[type] ?? []) fn(event);
    return respondWithPromise ? respondWithPromise : undefined;
  }

  return {
    listeners,
    caches,
    skipWaiting: self_.skipWaiting as ReturnType<typeof vi.fn>,
    clients: self_.clients as { claim: ReturnType<typeof vi.fn> },
    fetch: fetchMock,
    run,
    dispatch,
  };
}

// ---------------------------------------------------------------------------
// Pull the SW script from the route module
// ---------------------------------------------------------------------------

async function getSwScript(): Promise<string> {
  // Import after setting env so BUILD_ID is picked up
  const { GET } = await import("./route");
  const res = GET();
  return res.text();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SW API route — HTTP response", () => {
  it("returns Content-Type application/javascript", async () => {
    const { GET } = await import("./route");
    const res = GET();
    expect(res.headers.get("Content-Type")).toBe("application/javascript");
  });

  it("returns Cache-Control: no-store", async () => {
    const { GET } = await import("./route");
    const res = GET();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("sets Service-Worker-Allowed: /", async () => {
    const { GET } = await import("./route");
    const res = GET();
    expect(res.headers.get("Service-Worker-Allowed")).toBe("/");
  });

  it("embeds BUILD_ID in CACHE_NAME", async () => {
    const script = await getSwScript();
    expect(script).toMatch(/CACHE_NAME = 'dadjoksss-/);
  });
});

describe("SW fetch handler — online (network-first)", () => {
  let env: SwEnv;

  beforeEach(async () => {
    vi.resetModules();
    env = createSwEnv();
    const script = await getSwScript();
    env.run(script);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the network response when online", async () => {
    const networkResponse = new Response("fresh content", { status: 200 });
    env.fetch.mockResolvedValueOnce(networkResponse);

    const request = new Request("https://example.com/");
    const response = await env.dispatch("fetch", { request });

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("fresh content");
  });

  it("writes the network response into the cache", async () => {
    const networkResponse = new Response("fresh content", { status: 200 });
    env.fetch.mockResolvedValueOnce(networkResponse);

    const request = new Request("https://example.com/jokes");
    await env.dispatch("fetch", { request });

    // Allow the fire-and-forget cache.put to settle
    await new Promise((r) => setTimeout(r, 0));

    const cache = [...env.caches.store.values()][0];
    expect(cache?.put).toHaveBeenCalledWith(request, expect.any(Response));
  });

  it("does NOT cache non-ok responses (e.g. 404)", async () => {
    env.fetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const request = new Request("https://example.com/missing");
    await env.dispatch("fetch", { request });
    await new Promise((r) => setTimeout(r, 0));

    expect(env.caches.open).not.toHaveBeenCalled();
  });

  it("skips non-GET requests", async () => {
    const request = new Request("https://example.com/api/vote", { method: "POST" });
    const response = await env.dispatch("fetch", { request });

    expect(response).toBeUndefined();
    expect(env.fetch).not.toHaveBeenCalled();
  });

  it("skips /api/analytics requests", async () => {
    const request = new Request("https://example.com/api/analytics/track");
    const response = await env.dispatch("fetch", { request });

    expect(response).toBeUndefined();
    expect(env.fetch).not.toHaveBeenCalled();
  });
});

describe("SW fetch handler — offline (cache fallback)", () => {
  let env: SwEnv;

  beforeEach(async () => {
    vi.resetModules();
    env = createSwEnv();
    const script = await getSwScript();
    env.run(script);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to cached response when network fails", async () => {
    // Pre-populate the cache with a previously stored response
    const cachedResponse = new Response("cached content", { status: 200 });
    const request = new Request("https://example.com/");
    const cacheName = [...env.caches.store.keys()][0] ?? "dadjoksss-dev";
    const cache = makeMockCache();
    cache.store.set(request.url, cachedResponse);
    env.caches.store.set(cacheName, cache);
    env.caches.match.mockResolvedValueOnce(cachedResponse);

    // Network is down
    env.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const response = await env.dispatch("fetch", { request });

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("cached content");
  });

  it("returns undefined when offline and cache is empty", async () => {
    env.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    env.caches.match.mockResolvedValueOnce(undefined);

    const request = new Request("https://example.com/unknown");
    const response = await env.dispatch("fetch", { request });

    expect(response).toBeUndefined();
  });

  it("serves cache hit immediately without hitting network again after going online", async () => {
    // Simulate: page was visited online (response cached), then user went offline,
    // then came back online — SW should still prefer network when fetch succeeds
    const cachedResponse = new Response("stale cached", { status: 200 });
    const freshResponse = new Response("fresh from network", { status: 200 });

    const request = new Request("https://example.com/");
    const cacheName = "dadjoksss-dev";
    const cache = makeMockCache();
    cache.store.set(request.url, cachedResponse);
    env.caches.store.set(cacheName, cache);

    // Network is back online
    env.fetch.mockResolvedValueOnce(freshResponse);

    const response = await env.dispatch("fetch", { request });

    // Network-first: should get the fresh response, not the cached one
    expect(await response?.text()).toBe("fresh from network");
  });
});

describe("SW activate handler — cache cleanup", () => {
  let env: SwEnv;

  beforeEach(async () => {
    vi.resetModules();
    env = createSwEnv();
    const script = await getSwScript();
    env.run(script);
  });

  it("deletes caches from previous deployments on activate", async () => {
    env.caches.store.set("dadjoksss-old-version", makeMockCache());
    env.caches.store.set("dadjoksss-another-old", makeMockCache());

    await env.dispatch("activate");
    await new Promise((r) => setTimeout(r, 0));

    // Old caches should be deleted; only the current BUILD_ID cache remains
    expect(env.caches.delete).toHaveBeenCalledWith("dadjoksss-old-version");
    expect(env.caches.delete).toHaveBeenCalledWith("dadjoksss-another-old");
  });

  it("does not delete the current cache on activate", async () => {
    const { GET } = await import("./route");
    const script = await GET().text();
    const match = script.match(/CACHE_NAME = '([^']+)'/);
    const currentName = match?.[1] ?? "";

    env.caches.store.set(currentName, makeMockCache());

    await env.dispatch("activate");
    await new Promise((r) => setTimeout(r, 0));

    expect(env.caches.delete).not.toHaveBeenCalledWith(currentName);
  });

  it("calls clients.claim() on activate", async () => {
    await env.dispatch("activate");
    await new Promise((r) => setTimeout(r, 0));
    expect(env.clients.claim).toHaveBeenCalled();
  });
});

describe("SW install handler", () => {
  let env: SwEnv;

  beforeEach(async () => {
    vi.resetModules();
    env = createSwEnv();
    const script = await getSwScript();
    env.run(script);
  });

  it("pre-caches / and /manifest.json on install", async () => {
    await env.dispatch("install");
    await new Promise((r) => setTimeout(r, 0));

    const cache = [...env.caches.store.values()][0];
    expect(cache?.addAll).toHaveBeenCalledWith(["/", "/manifest.json"]);
  });

  it("calls skipWaiting on install", async () => {
    await env.dispatch("install");
    expect(env.skipWaiting).toHaveBeenCalled();
  });
});
