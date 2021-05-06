import Head from "next/head"
import { titleIfy, slugify } from "../utils/helpers"
import { DisplayMedium } from "../components"
import CartLink from "../components/CartLink"
import prisma from "../lib/prisma-client"
import { FC } from "react"
import { Category, Product } from "@prisma/client"

type categoryType = Category & {
  products: Product[]
}

type Props = {
  categories: categoryType[]
}

const Categories: FC<Props> = ({ categories = [] }) => {
  return (
    <>
      <div className="w-full">
        <CartLink />
        <Head>
          <title>Jamstack ECommerce - All Categories</title>
          <meta
            name="description"
            content={`Jamstack ECommerce - All categories`}
          />
          <meta
            property="og:title"
            content="Jamstack ECommerce - All Categories"
            key="title"
          />
        </Head>
        <div className="pt-4 pb-8 sm:pt-10">
          <h1 className="text-5xl font-light">All categories</h1>
        </div>
        <div className="flex flex-col items-center">
          {/* <div className="flex flex-col justify-between my-4 lg:my-8 lg:flex-row"> */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
            {categories.map((category, index) => (
              <DisplayMedium
                key={index}
                imageSrc={category.image}
                subtitle={`${category.products.length} items`}
                title={titleIfy(category.name)}
                link={`/category/${slugify(category.name)}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export async function getStaticProps() {
  const categories = await prisma.category.findMany({
    include: {
      products: true,
    },
  })

  return {
    props: {
      categories,
    },
    revalidate: 1,
  }
}

export default Categories
