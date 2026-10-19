import { compose, username } from './stack.js';

// Builds and starts the stack, then fills the account with the sample
// projects. With KEEP_STACK=1 a stack left from an earlier run is reused and
// keeps its data.
export default function setup() {
  compose('up', '-d', '--build', '--wait');
  try {
    compose('exec', '-T', 'app', 'node', 'dist/cli.js', 'seed', username);
  } catch (error) {
    if (!process.env.KEEP_STACK) throw error;
  }
}
