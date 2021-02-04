import { PrismaClient } from "@prisma/client"
import { categories, products } from "../utils/data"
const prisma = new PrismaClient()

async function main() {
  // creates categories
  await Promise.all(
    categories.map(({ name, id, image }) =>
      prisma.category.upsert({
        where: { id: id },
        update: {},
        create: { name, id, image },
      })
    )
  )
  await Promise.all(
    products.map(
      ({
        categories,
        id,
        name,
        price,
        image,
        description,
        brand,
        currentInventory,
      }) =>
        prisma.product.upsert({
          where: { id },
          update: {},
          create: {
            id,
            name,
            price,
            image,
            description,
            brand,
            currentInventory,
            categories: {
              connect: categories.map((id) => ({ id })),
            },
          },
        })
    )
  )
}

main()
  .then(() => console.log(`Seeded data successfully`))
  .catch((e) => console.error(`Failed to seed data, ${e}`))
  .finally(async () => {
    await prisma.$disconnect()
  })

export default main
