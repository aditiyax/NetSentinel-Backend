import { prisma } from "../src/index";


const USER_ID = "4";

async function seed() {
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: "test@yopmail.com"
    }
  });

  const website = await prisma.website.create({
    data: {
      url: "https://test.com",
      userId: USER_ID
    }
  });

  const validator = await prisma.validator.create({
    data: {
      publicKey: "1x2345432345",
      location: "Delhi",
      ip: "127.0.0.1"
    }
  });

  await prisma.websiteTick.create({
    data: {
      websiteId: website.id,
      status: "Good",
      createdAt: new Date(),
      latency: 100,
      validatorId: validator.id
    }
  });

  await prisma.websiteTick.create({
    data: {
      websiteId: website.id,
      status: "Good",
      createdAt: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago
      latency: 100,
      validatorId: validator.id
    }
  });

  await prisma.websiteTick.create({
    data: {
      websiteId: website.id,
      status: "Bad",
      createdAt: new Date(Date.now() - 1000 * 60 * 20), // 20 minutes ago
      latency: 100,
      validatorId: validator.id
    }
  });

  console.log("✅ Seeded successfully!");
}

seed().catch((err) => {
  console.error("❌ Error during seeding:", err);
  process.exit(1);
});