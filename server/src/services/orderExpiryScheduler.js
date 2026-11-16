import { expirePendingOrders } from './orderService.js';

let timer;
let running = false;

export function startOrderExpiryScheduler() {
  if (timer) return timer;
  const check = async () => {
    if (running) return;
    running = true;
    try { await expirePendingOrders(); }
    catch (error) { console.error('Pending order expiry check failed', { name: error.name ?? 'Error' }); }
    finally { running = false; }
  };
  timer = setInterval(check, 30_000);
  timer.unref?.();
  void check();
  return timer;
}
