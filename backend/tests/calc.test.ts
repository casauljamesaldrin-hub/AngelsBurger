import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { aggregate, lineRequirements, lineTotal, stockState } from '../src/lib/calc';

const r = (id: string, q: number) => ({ ingredientId: id, name: id, unit: 'pcs', quantity: q });

describe('order maths', () => {
  it('prices a line with add-ons in whole centavos', () => {
    expect(lineTotal(5000, [1500, 2000], 3)).toBe(25500);
  });
  it('rejects non-integer money', () => {
    expect(() => lineTotal(50.5, [], 1)).toThrow();
  });
  it('multiplies recipe by quantity and adds option ingredients', () => {
    const out = lineRequirements([r('bread', 1), r('cheese', 1)], [[r('cheese', 1)]], 2);
    const cheese = out.find((x) => x.ingredientId === 'cheese')!;
    expect(cheese.quantity.toString()).toBe('4'); // (1 + 1) x 2, one combined deduction
    expect(out).toHaveLength(2);
  });
  it('aggregates a shared ingredient across lines exactly once', () => {
    const a = lineRequirements([r('bread', 1)], [], 2);
    const b = lineRequirements([r('bread', 1), r('egg', 1)], [], 3);
    const total = aggregate([a, b]);
    expect(total.find((x) => x.ingredientId === 'bread')!.quantity.toString()).toBe('5');
    expect(total).toHaveLength(2);
  });
  it('keeps decimal quantities exact', () => {
    const out = lineRequirements([r('mayo', 0.1)], [], 3);
    expect(out[0].quantity.equals(new Decimal('0.3'))).toBe(true);
  });
});

describe('stock status', () => {
  it('classifies out / low / in', () => {
    expect(stockState(0, 5)).toBe('OUT');
    expect(stockState(5, 5)).toBe('LOW');
    expect(stockState(5.001, 5)).toBe('IN');
  });
});
