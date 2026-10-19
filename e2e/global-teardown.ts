import { compose } from './stack.js';

export default function teardown() {
  if (process.env.KEEP_STACK) return;
  compose('down', '-v');
}
