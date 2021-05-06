import Head from "next/head"
import {
  Center,
  Footer,
  Tag,
  Showcase,
  DisplaySmall,
  DisplayMedium,
} from "../components"
import { FC } from "react"
import { titleIfy, slugify } from "../utils/helpers"
import CartLink from "../components/CartLink"
import prismaClient from "../lib/prisma-client"
import { Category, Product } from "@prisma/client"

type inventoryDataType = Product & {
  categories: Category[]
}

type categoryDataType = Category & {
  products: Product[]
}

type Props = {
  inventoryData: inventoryDataType[] | []
  categories: categoryDataType[] | []
}

const Home: FC<Props> = ({
  inventoryData = [],
  categories: categoryData = [],
}) => {
  const inventory = inventoryData.slice(0, 4)
  const categories = categoryData.slice(0, 2)

  console.log({ inventory, categories })

  return (
    <>
      <CartLink />
      <div className="w-full">
        <Head>
          <title>Jamstack ECommerce</title>
          <meta
            name="description"
            content="Jamstack ECommerce Next provides a way to quickly get up and running with a fully configurable ECommerce site using Next.js."
          />
          <meta property="og:title" content="Jamstack ECommerce" key="title" />
        </Head>
        <div className="flex flex-col p-6 pb-10 bg-blue-300 smpb-6 lg:flex-row">
          <div className="flex flex-col pt-4 pl-2 sm:pt-12 sm:pl-12">
            <Tag year="2021" category="SOFAS" />
            <Center
              price="200"
              title={inventory[2].name}
              link={`/product/${slugify(inventory[2].name)}`}
            />
            <Footer designer="Jason Bourne" />
          </div>
          <div className="relative flex items-center justify-center flex-1">
            <Showcase imageSrc={inventory[2].image} />
            <div className="absolute z-0 w-48 h-48 bg-white rounded-full sm:w-72 sm:h-72 xl:w-88 xl:h-88" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 my-4 lg:my-8 lg:grid-cols-2">
        <DisplayMedium
          imageSrc={categories[0].image}
          subtitle={`${categories[0].products.length} items`}
          title={titleIfy(categories[0].name)}
          link={`/category/${slugify(categories[0].name)}`}
        />
        <DisplayMedium
          imageSrc={categories[1].image}
          subtitle={`${categories[1].products.length} items`}
          title={titleIfy(categories[1].name)}
          link={`/category/${slugify(categories[1].name)}`}
        />
      </div>
      <div className="flex flex-col items-center pt-10 pb-6">
        <h2 className="mb-3 text-4xl">Trending Now</h2>
        <p className="text-sm text-gray-600">
          Find the perfect piece or accessory to finish off your favorite room
          in the house.
        </p>
      </div>
      <div className="flex flex-col justify-between my-8 lg:flex-row">
        <DisplaySmall
          imageSrc={inventory[0].image}
          title={inventory[0].name}
          subtitle={inventory[0].categories[0].name}
          link={`/product/${slugify(inventory[0].name)}`}
        />

        <DisplaySmall
          imageSrc={inventory[1].image}
          title={inventory[1].name}
          subtitle={inventory[1].categories[0].name}
          link={`/product/${slugify(inventory[1].name)}`}
        />

        <DisplaySmall
          imageSrc={inventory[2].image}
          title={inventory[2].name}
          subtitle={inventory[2].categories[0].name}
          link={`/product/${slugify(inventory[2].name)}`}
        />

        <DisplaySmall
          imageSrc={inventory[3].image}
          title={inventory[3].name}
          subtitle={inventory[3].categories[0].name}
          link={`/product/${slugify(inventory[3].name)}`}
        />
      </div>
    </>
  )
}

export async function getStaticProps() {
  const categories = await prismaClient.category.findMany({
    include: {
      products: true,
    },
  })

  const inventoryData = await prismaClient.product.findMany({
    include: {
      categories: true,
    },
  })

  return {
    props: {
      inventoryData,
      categories,
    },
    revalidate: 1,
  }
}

export default Home
