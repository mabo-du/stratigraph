#!/usr/bin/env node

import { createInterface } from 'readline';
import { Bridge } from './bridge';
import { parseMessage, serializeMessage } from './protocol';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const bridge = new Bridge((msg) => {
  process.stdout.write(serializeMessage(msg));
});

rl.on('line', (line: string) => {
  const msg = parseMessage(line);
  if (!msg) {
    process.stdout.write(serializeMessage({ type: 'error', message: 'Invalid message' }));
    return;
  }
  const response = bridge.handle(msg);
  if (response) {
    process.stdout.write(serializeMessage(response));
  }
});

rl.on('close', () => {
  process.exit(0);
});
