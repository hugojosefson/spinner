// This program prints all braille characters in the Unicode standard.
// Each character is printed over the previous one, so the output
// looks like a binary counter happening in one character's place on the screen.
// The rest of the screen is unaffected.

const ANSI_CURSOR_LEFT = "\x1b[1D"; // Move cursor back one character

const ANSI_CURSOR_HIDE = "\x1b[?25l"; // Hide cursor
const ANSI_CURSOR_SHOW = "\x1b[?25h"; // Show cursor

const ALL_BRAILLE_CHARS = Array.from(
  { length: 0x28FF - 0x2800 + 1 },
  (_, i) => String.fromCodePoint(0x2800 + i),
);

const ALL_BRAILLE_FRAMES = ALL_BRAILLE_CHARS.map(encode);

function encode(char: string): Uint8Array {
  return new TextEncoder().encode(
    [
      ANSI_CURSOR_LEFT,
      char,
    ].join(""),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Canceller = () => void;

interface IDeferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
  readonly isResolved: boolean;
  readonly isRejected: boolean;
  readonly isDone: boolean;
}

class Deferred<T> implements IDeferred<T> {
  readonly promise: Promise<T>;
  private _resolve!: (value: T) => void;
  private _reject!: (reason: unknown) => void;
  private _isResolved = false;
  private _isRejected = false;
  get isResolved() {
    return this._isResolved;
  }
  get isRejected() {
    return this._isRejected;
  }
  get isDone() {
    return this._isResolved || this._isRejected;
  }
  get resolve() {
    return this._resolve;
  }
  get reject() {
    return this._reject;
  }

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = (value: T) => {
        this._isResolved = true;
        resolve(value);
      };
      this._reject = (reason: unknown) => {
        this._isRejected = true;
        reject(reason);
      };
    });
  }
}

/**
 * Spins printing all braile characters until the returned canceller is called.
 * @param ms The number of milliseconds to wait between printing each character.
 * @returns A canceller that can be called to stop the spinner. The canceller returns a Promise that resolves when the spinner has stopped, and printed an ANSI code to reset the cursor.
 */
function spin(ms = 500): { cancel: Canceller; done: Promise<void> } {
  let cancelled = false;
  let cancelledPromise;
  const done: Deferred<void> = new Deferred();

  async function spinInternal(): Promise<void> {
    await Deno.stderr.write(new TextEncoder().encode(ANSI_CURSOR_HIDE));
    while (!cancelled) {
      for (const frame of ALL_BRAILLE_FRAMES) {
        if (cancelled) {
          break;
        }

        await Deno.stderr.write(frame);
        await sleep(ms);
        throw new Error("test");
      }
    }
    cancelled;
  }

  async function cancel(): Promise<void> {
    cancelled = true;
    await Deno.stderr.write(new TextEncoder().encode(
      [
        ANSI_CURSOR_LEFT,
        " ",
        ANSI_CURSOR_LEFT,
        ANSI_CURSOR_SHOW,
      ].join(""),
    ));
    done.resolve();
    await done.promise;
  }

  const internalPromise = spinInternal();
  internalPromise.then(done.resolve, done.resolve);
  return {
    cancel,
    done: done.promise,
  };
}

async function waitForKeypress(): Promise<void> {
  try {
    Deno.stdin.setRaw(true);
    await Deno.stdin.read(new Uint8Array(1));
  } finally {
    Deno.stdin.setRaw(false);
  }
}

async function main(_args: string[]): Promise<void> {
  await Deno.stderr.write(new TextEncoder().encode("Working... "));

  try {
    Deno.stdin.setRaw(true);
    const { cancel, done } = spin(500);
    await waitForKeypress();
    cancel();
    await done;
  } finally {
    Deno.stderr.write(new TextEncoder().encode(ANSI_CURSOR_SHOW));
  }

  console.log("Done!");
}

if (import.meta.main) {
  await main(Deno.args);
}
