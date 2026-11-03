import { isOrder, summarize, type Order } from '../../core/spend.ts';

declare const BRITTO_API: string;
const site = document.getElementById('site') as HTMLAnchorElement;
site.href = BRITTO_API;
(document.getElementById('version') as HTMLElement).textContent = `v${chrome.runtime.getManifest().version}`;

// Spend Lens (BLUEPRINT §13): the orders this browser kept (chrome.storage.local), summed here.
const spend = document.getElementById('spend') as HTMLElement;
const clear = document.getElementById('spend-clear') as HTMLButtonElement;
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
async function showSpend(): Promise<void> {
  const kept = ((await chrome.storage.local.get('spend:orders'))['spend:orders'] ?? []) as unknown[];
  const s = summarize(kept.filter(isOrder) as Order[]);
  if (s.orders === 0) return;
  spend.textContent = `${rupees(s.total)} on ${s.orders} order${s.orders === 1 ? '' : 's'} (${s.first} to ${s.last}), kept on this computer only. Latest month with orders (${s.byMonth[0]?.month}): ${rupees(s.byMonth[0]?.total ?? 0)}.`;
  clear.hidden = false;
}
clear.addEventListener('click', async () => {
  await chrome.storage.local.remove('spend:orders');
  clear.hidden = true;
  spend.textContent = 'Deleted from this computer.';
});
void showSpend();
