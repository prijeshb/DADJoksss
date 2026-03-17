import { encode } from "modern-gif";
import type { DadJoke } from "./types";

// Canvas dimensions — kept small to limit memory usage (~360x480 = ~690kb raw per frame)
const WIDTH = 360;
const HEIGHT = 480;

// Hard limits on text length — prevents canvas overflow and runaway rendering
const MAX_TEXT_LEN = 160;
const MAX_ANSWER_LEN = 120;

// Wrap text into lines that fit within maxWidth
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawBackground(ctx: CanvasRenderingContext2D, variant: "question" | "answer") {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  if (variant === "question") {
    bg.addColorStop(0, "#0f0f1a");
    bg.addColorStop(1, "#1a1a2e");
  } else {
    bg.addColorStop(0, "#0d1a0f");
    bg.addColorStop(1, "#0f1a1a");
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawBranding(ctx: CanvasRenderingContext2D) {
  // Mini brand icon: purple rounded square + "DAD" + "joksss" — mirrors public/icon.svg
  const iconSize = 44;
  const iconX = WIDTH / 2 - iconSize / 2;
  const iconY = HEIGHT - iconSize - 12;
  const radius = 10;

  // Purple gradient background
  const bg = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
  bg.addColorStop(0, "#8b5cf6");
  bg.addColorStop(1, "#6d28d9");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(iconX, iconY, iconSize, iconSize, radius);
  ctx.fill();

  // "DAD" text inside the icon
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DAD", WIDTH / 2, iconY + 23);

  // "joksss" sub-text inside the icon
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("joksss", WIDTH / 2, iconY + 36);
}

function renderQuestionFrame(ctx: CanvasRenderingContext2D, joke: DadJoke) {
  drawBackground(ctx, "question");

  // Language badge
  const badgeColor = joke.language === "hinglish" ? "#f97316" : "#3b82f6";
  const badgeLabel = joke.language === "hinglish" ? "Hinglish" : "English";
  ctx.fillStyle = `${badgeColor}33`;
  ctx.beginPath();
  ctx.roundRect(WIDTH / 2 - 36, 28, 72, 22, 11);
  ctx.fill();
  ctx.fillStyle = badgeColor;
  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(badgeLabel, WIDTH / 2, 43);

  // Question text
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  const lines = wrapText(ctx, joke.question, WIDTH - 60);
  const lineHeight = 30;
  const totalHeight = lines.length * lineHeight;
  const startY = HEIGHT / 2 - totalHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, startY + i * lineHeight);
  });

  // Tap hint
  drawBranding(ctx);
}

function renderAnswerFrame(ctx: CanvasRenderingContext2D, joke: DadJoke) {
  drawBackground(ctx, "answer");

  // "Answer" label
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ANSWER", WIDTH / 2, 48);

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 58);
  ctx.lineTo(WIDTH - 40, 58);
  ctx.stroke();

  // Answer text — gradient colour
  const grad = ctx.createLinearGradient(0, HEIGHT / 2 - 40, 0, HEIGHT / 2 + 40);
  grad.addColorStop(0, "#a78bfa");
  grad.addColorStop(1, "#34d399");
  ctx.fillStyle = grad;
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, sans-serif";
  const lines = wrapText(ctx, joke.answer, WIDTH - 60);
  const lineHeight = 32;
  const totalHeight = lines.length * lineHeight;
  const startY = HEIGHT / 2 - totalHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, startY + i * lineHeight);
  });

  drawBranding(ctx);
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  // Setting dimensions to 0 releases the backing store memory
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Generates an animated GIF for a dad joke.
 *
 * Memory safety:
 *  - Canvas is created, used, and explicitly released in a finally block
 *  - ImageData is extracted into local arrays and not held beyond encode()
 *  - The returned Blob URL must be revoked by the caller via URL.revokeObjectURL()
 *
 * Security:
 *  - Joke text is truncated to MAX_TEXT_LEN / MAX_ANSWER_LEN before rendering
 *  - No user-supplied HTML or scripts are executed
 *  - AbortSignal is checked before each expensive step
 *
 * @param joke - The joke to render
 * @param signal - Optional AbortSignal to cancel mid-generation
 * @returns Blob of type image/gif — caller must revoke the object URL when done
 */
export async function generateJokeGif(joke: DadJoke, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();

  // Sanitize text length before touching the canvas
  const safeJoke: DadJoke = {
    ...joke,
    question: joke.question.slice(0, MAX_TEXT_LEN),
    answer: joke.answer.slice(0, MAX_ANSWER_LEN),
  };

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    signal?.throwIfAborted();

    // Frame 1 — question
    renderQuestionFrame(ctx, safeJoke);
    const frame1 = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    signal?.throwIfAborted();

    // Frame 2 — answer
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    renderAnswerFrame(ctx, safeJoke);
    const frame2 = ctx.getImageData(0, 0, WIDTH, HEIGHT);

    signal?.throwIfAborted();

    // Encode — modern-gif manages its own worker lifecycle
    const buffer = await encode({
      width: WIDTH,
      height: HEIGHT,
      frames: [
        { data: frame1.data, delay: 400 },  // 4s  — time to read the question
        { data: frame2.data, delay: 350 },  // 3.5s — time to read the answer  →  total 7.5s
      ],
    });

    signal?.throwIfAborted();

    return new Blob([buffer], { type: "image/gif" });
  } finally {
    // Always release canvas memory, even on error or abort
    releaseCanvas(canvas);
  }
}
