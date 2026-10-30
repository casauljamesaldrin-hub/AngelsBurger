import Decimal from 'decimal.js';

export interface RecipeLine { ingredientId: string; name: string; unit: string; quantity: Decimal.Value }
export interface Requirement { ingredientId: string; name: string; unit: string; quantity: Decimal }

/** Sum requirements per ingredient so each ingredient is deducted exactly once. */
export function aggregate(lists: Requirement[][]): Requirement[] {
  const map = new Map<string, Requirement>();
  for (const list of lists) for (const r of list) {
    const cur = map.get(r.ingredientId);
    if (cur) cur.quantity = cur.quantity.plus(r.quantity);
    else map.set(r.ingredientId, { ...r, quantity: new Decimal(r.quantity) });
  }
  return [...map.values()];
}

/** Requirements for one order line: (base recipe + selected option recipes) x quantity. */
export function lineRequirements(recipe: RecipeLine[], optionRecipes: RecipeLine[][], qty: number): Requirement[] {
  const all = [recipe, ...optionRecipes].map((l) =>
    l.map((x) => ({ ingredientId: x.ingredientId, name: x.name, unit: x.unit, quantity: new Decimal(x.quantity).times(qty) })));
  return aggregate(all);
}

/** Money is always integer centavos. */
export function lineTotal(unitPrice: number, optionPrices: number[], qty: number): number {
  if (![unitPrice, qty, ...optionPrices].every(Number.isInteger)) throw new Error('Money values must be integer centavos');
  return (unitPrice + optionPrices.reduce((a, b) => a + b, 0)) * qty;
}

export type StockState = 'OUT' | 'LOW' | 'IN';
export function stockState(qty: Decimal.Value, min: Decimal.Value): StockState {
  const q = new Decimal(qty);
  if (q.lte(0)) return 'OUT';
  if (q.lte(min)) return 'LOW';
  return 'IN';
}
