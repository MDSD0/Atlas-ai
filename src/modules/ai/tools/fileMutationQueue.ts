import { native } from "../lib/native";

type Canonicalize = (path: string) => Promise<string>;

const fileMutationQueues = new Map<string, Promise<void>>();
let registrationQueue = Promise.resolve();

async function mutationQueueKey(
  filePath: string,
  canonicalize: Canonicalize,
): Promise<string> {
  try {
    return await canonicalize(filePath);
  } catch {
    // New files do not canonicalize yet. Callers already resolved and checked
    // the target path before entering the queue, so that path is the fallback.
    return filePath;
  }
}

/**
 * Serialize mutation operations targeting the same canonical file.
 * Operations for different files still run in parallel.
 */
export async function withFileMutationQueue<T>(
  filePath: string,
  fn: () => Promise<T>,
  canonicalize: Canonicalize = native.canonicalize,
): Promise<T> {
  const registration = registrationQueue.then(async () => {
    const key = await mutationQueueKey(filePath, canonicalize);
    const currentQueue = fileMutationQueues.get(key) ?? Promise.resolve();

    let releaseNext!: () => void;
    const nextQueue = new Promise<void>((resolveQueue) => {
      releaseNext = resolveQueue;
    });
    const chainedQueue = currentQueue.then(() => nextQueue);
    fileMutationQueues.set(key, chainedQueue);

    return { key, currentQueue, chainedQueue, releaseNext };
  });
  registrationQueue = registration.then(
    () => undefined,
    () => undefined,
  );

  const { key, currentQueue, chainedQueue, releaseNext } = await registration;
  await currentQueue;
  try {
    return await fn();
  } finally {
    releaseNext();
    if (fileMutationQueues.get(key) === chainedQueue) {
      fileMutationQueues.delete(key);
    }
  }
}
