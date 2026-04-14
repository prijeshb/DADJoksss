interface FetchEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
}
