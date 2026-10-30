import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 10) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) in backend/.env first.');
    process.exit(1);
  }
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: process.env.ADMIN_NAME || 'Store Admin', role: 'ADMIN', passwordHash: await bcrypt.hash(pw, 12), notifyLowStock: true, notifyOutOfStock: true, notifyDailySummary: true },
  });
  console.log(`Admin ready: ${email} (existing accounts are never overwritten)`);

  if (process.env.SEED_SAMPLE_DATA !== 'true') return;
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed sample data in production.'); process.exit(1); }

  // SAMPLE DATA ONLY: names, prices, recipes and quantities below are illustrative, not real Angels Burger data.
  const sample = [
    ['Bread', 'pcs', 100, 20], ['Hotdog', 'pcs', 80, 15], ['Cheese', 'pcs', 100, 20], ['Footlong', 'pcs', 60, 10],
    ['Egg', 'pcs', 60, 12], ['Burger Patty', 'pcs', 100, 20], ['Mayonnaise', 'ml', 2000, 500], ['Ketchup', 'ml', 2000, 500],
  ] as const;
  const ing: Record<string, string> = {};
  for (const [name, unit, qty, min] of sample) {
    const i = await prisma.ingredient.upsert({ where: { name }, update: {}, create: { name, unit, quantity: qty, minThreshold: min, description: 'SAMPLE DATA' } });
    ing[name] = i.id;
  }
  const products: [string, number, [string, number][]][] = [
    ['Classic Burger (sample)', 5000, [['Bread', 1], ['Burger Patty', 1], ['Mayonnaise', 10], ['Ketchup', 10]]],
    ['Cheesy Burger (sample)', 6500, [['Bread', 1], ['Burger Patty', 1], ['Cheese', 1], ['Mayonnaise', 10], ['Ketchup', 10]]],
    ['Cheesedog (sample)', 5500, [['Bread', 1], ['Hotdog', 1], ['Cheese', 1], ['Ketchup', 10]]],
    ['Egg Burger (sample)', 6000, [['Bread', 1], ['Burger Patty', 1], ['Egg', 1], ['Mayonnaise', 10]]],
  ];
  for (const [name, price, recipe] of products) {
    await prisma.product.upsert({
      where: { name }, update: {},
      create: { name, priceCentavos: price, description: 'SAMPLE DATA', recipe: { create: recipe.map(([n, q]) => ({ ingredientId: ing[n], quantity: q })) } },
    });
  }
  await prisma.productOption.upsert({
    where: { name: 'Extra cheese (sample)' }, update: {},
    create: { name: 'Extra cheese (sample)', priceCentavos: 1500, items: { create: [{ ingredientId: ing['Cheese'], quantity: 1 }] }, products: { connect: (await prisma.product.findMany({ where: { name: { contains: 'Burger' } } })).map((p) => ({ id: p.id })) } },
  });
  console.log('Sample ingredients, products, recipes and one add-on created.');
}
main().finally(() => prisma.$disconnect());
