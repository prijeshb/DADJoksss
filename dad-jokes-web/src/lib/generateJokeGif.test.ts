// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DadJoke } from "./types";

// --- Mock modern-gif ---
vi.mock("modern-gif", () => ({
  encode: vi.fn().mockResolvedValue(new Uint8Array([0x47, 0x49, 0x46])), // GIF magic bytes
}));

// --- Canvas mock ---
// jsdom doesn't implement canvas; we provide a minimal mock
const mockImageData = { data: new Uint8ClampedArray(360 * 480 * 4) };
const mockCtx = {
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
  fillText: vi.fn(),
  getImageData: vi.fn().mockReturnValue(mockImageData),
  fillStyle: "",
  font: "",
  textAlign: "center" as CanvasTextAlign,
  strokeStyle: "",
  lineWidth: 0,
};

const mockCanvas = {
  width: 360,
  height: 480,
  getContext: vi.fn().mockReturnValue(mockCtx),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCanvas.width = 360;
  mockCanvas.height = 480;
  mockCtx.measureText.mockReturnValue({ width: 50 });
  mockCtx.getImageData.mockReturnValue(mockImageData);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") return mockCanvas as unknown as HTMLCanvasElement;
    return document.createElement(tag);
  });
});

const baseJoke: DadJoke = {
  id: "en-001",
  question: "Why don't scientists trust atoms?",
  answer: "Because they make up everything!",
  language: "english",
  category: "science",
  wrongAnswers: [],
  difficulty: 1,
  tags: [],
};

describe("generateJokeGif", () => {
  it("returns a GIF blob", async () => {
    const { generateJokeGif } = await import("./generateJokeGif");
    const blob = await generateJokeGif(baseJoke);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/gif");
  });

  it("releases canvas memory in the finally block (width/height set to 0)", async () => {
    const { generateJokeGif } = await import("./generateJokeGif");
    await generateJokeGif(baseJoke);
    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
  });

  it("releases canvas even when encode throws", async () => {
    const { encode } = await import("modern-gif");
    vi.mocked(encode).mockRejectedValueOnce(new Error("encode failed"));

    const { generateJokeGif } = await import("./generateJokeGif");
    await expect(generateJokeGif(baseJoke)).rejects.toThrow("encode failed");
    expect(mockCanvas.width).toBe(0);
    expect(mockCanvas.height).toBe(0);
  });

  it("truncates question to 160 chars before rendering", async () => {
    const longQuestion = "A".repeat(300);
    const { generateJokeGif } = await import("./generateJokeGif");
    await generateJokeGif({ ...baseJoke, question: longQuestion });

    // All fillText calls should receive strings ≤ 160 chars for the question
    const calls = mockCtx.fillText.mock.calls.map(([text]) => text as string);
    const rendered = calls.join(" ");
    expect(rendered).not.toContain("A".repeat(161));
  });

  it("truncates answer to 120 chars before rendering", async () => {
    const longAnswer = "B".repeat(300);
    const { generateJokeGif } = await import("./generateJokeGif");
    await generateJokeGif({ ...baseJoke, answer: longAnswer });

    const calls = mockCtx.fillText.mock.calls.map(([text]) => text as string);
    const rendered = calls.join(" ");
    expect(rendered).not.toContain("B".repeat(121));
  });

  it("throws AbortError immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const { generateJokeGif } = await import("./generateJokeGif");
    await expect(generateJokeGif(baseJoke, controller.signal)).rejects.toThrow();
    // Canvas should not have been created
    expect(mockCtx.fillRect).not.toHaveBeenCalled();
  });

  it("throws and releases canvas if signal is aborted mid-generation", async () => {
    const controller = new AbortController();

    // Abort after first getImageData call (between frame 1 and frame 2)
    mockCtx.getImageData.mockImplementationOnce(() => {
      controller.abort();
      return mockImageData;
    });

    const { generateJokeGif } = await import("./generateJokeGif");
    await expect(generateJokeGif(baseJoke, controller.signal)).rejects.toThrow();
    expect(mockCanvas.width).toBe(0);
  });

  it("renders two frames (getImageData called twice)", async () => {
    const { generateJokeGif } = await import("./generateJokeGif");
    await generateJokeGif(baseJoke);
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(2);
  });

  it("does not embed the joke URL in any canvas text", async () => {
    const { generateJokeGif } = await import("./generateJokeGif");
    await generateJokeGif(baseJoke);
    const allText = mockCtx.fillText.mock.calls.map(([t]) => t as string).join(" ");
    expect(allText).not.toContain("/joke/");
    expect(allText).not.toContain("http");
  });
});
