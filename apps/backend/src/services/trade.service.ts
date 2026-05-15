// Barrel module — trade logic is split across focused service files.
// Routes can keep importing `trade.service.js` for backward-compatible naming.
export * from './trade-matching.service.js';
export * from './trade-requests.service.js';
