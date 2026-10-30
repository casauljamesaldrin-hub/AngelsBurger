/* Shared ingredient helpers: category guess, category pill colors, emoji icon. Save as src/lib/ingredientMeta.ts */
// Category comes from the API if it exists (ing.category); otherwise it is guessed from the name.
const CATEGORY_RULES: [RegExp, string][] = [
  [/bun|bread|footlong bread|pandesal/i, 'Bread'],
  [/cheese|milk|butter|cream/i, 'Dairy'],
  [/coke|sprite|royal|juice|water|soda|tea|coffee|drink/i, 'Beverage'],
  [/egg|lettuce|tomato|onion|pickle|potato|cabbage|vegetable/i, 'Produce'],
  [/sauce|ketchup|mayo|mustard|oil|salt|pepper|sugar|dressing|vinegar/i, 'Condiments'],
  [/patty|beef|pork|chicken|sausage|hotdog|footlong|bacon|ham/i, 'Meat'],
];
export const categoryOf = (i: any): string => i.category?.name ?? i.category ?? CATEGORY_RULES.find(([re]) => re.test(i.name))?.[1] ?? 'Other';

export const CATEGORY_STYLE: Record<string, string> = {
  Meat: 'bg-red-100 text-red-600',
  Dairy: 'bg-amber-100 text-amber-700',
  Beverage: 'bg-violet-100 text-violet-700',
  Produce: 'bg-emerald-100 text-emerald-700',
  Bread: 'bg-orange-100 text-orange-600',
  Condiments: 'bg-rose-100 text-rose-600',
  Other: 'bg-neutral-100 text-neutral-600',
};

const ICON_RULES: [RegExp, string][] = [
  [/patty|burger/i, '🍔'],
  [/cheese/i, '🧀'],
  [/water/i, '💧'],
  [/coke|sprite|royal|dew|pepsi|7up|cola|soda|softdrink|drink/i, '🥤'],
  [/juice/i, '🧃'],
  [/milk/i, '🥛'],
  [/coffee/i, '☕'],
  [/tea/i, '🍵'],
  [/beer/i, '🍺'],
  [/egg/i, '🥚'],
  [/footlong|hotdog|sausage/i, '🌭'],
  [/bun|bread/i, '🍞'],
  [/hot sauce|chili/i, '🌶️'],
  [/ketchup|tomato/i, '🍅'],
  [/lettuce|cabbage/i, '🥬'],
  [/onion/i, '🧅'],
  [/potato|fries/i, '🍟'],
  [/pickle/i, '🥒'],
  [/sauce|mayo|mustard/i, '🥫'],
];
export const iconOf = (name: string) => ICON_RULES.find(([re]) => re.test(name))?.[1] ?? '📦';