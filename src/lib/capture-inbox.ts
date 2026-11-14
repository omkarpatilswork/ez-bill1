/**
 * Files picked in the "Add a bill" sheet, on their way to the review screen.
 * A File cannot ride in a URL, so the sheet leaves them here and the screen
 * collects them once. Nothing is kept after that.
 */
let waiting: File[] = [];

export function handOver(files: File[]): void {
  waiting = files;
}

export function collect(): File[] {
  const files = waiting;
  waiting = [];
  return files;
}
