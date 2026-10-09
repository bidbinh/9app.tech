// Hosted adapter for GET /9fly/api/board. Same resolver as server.js.
import { resolveBoard } from '../lib/board.mjs';

export const maxDuration = 20;

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const result = await resolveBoard(url.searchParams.get('airport') || '');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.status(result.status).json(result.body);
}
