import Head from "next/head"
import ListItem from "../../components/ListItem"
import { titleIfy, slugify } from "../../utils/helpers"
import fetchCategories from "../../utils/categoryProvider"
import CartLink from "../../components/CartLink"
import prismaClient from "../../lib/prisma-client"

const Category = ({ inventory, title }) => {
  return (
    <>
      <CartLink />
      <Head>
        <title>Jamstack ECommerce - {title}</title>
        <meta name="description" content={`Jamstack ECommerce - ${title}`} />
        <meta
          property="og:title"
          content={`Jamstack ECommerce - ${title}`}
          key="title"
        />
      </Head>
      <div className="flex flex-col items-center">
        <div className="flex flex-col w-full max-w-fw">
          <div className="pt-4 pb-8 sm:pt-10">
            <h1 className="text-5xl font-light">{titleIfy(title)}</h1>
          </div>

          <div>
            <div className="flex flex-row flex-wrap flex-1">
              {inventory.map((item, index) => {
                return (
                  <ListItem
                    key={index}
                    link={`/product/${slugify(item.name)}`}
                    title={item.name}
                    price={item.price}
                    imageSrc={item.image}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export async function getStaticPaths() {
  const categories = await fetchCategories()
  const paths = categories.map((category) => {
    return { params: { name: slugify(category) } }
  })
  return {
    paths,
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  const category = params.name.replace(/-/g, " ")
  const products = await prismaClient.product.findMany({
    where: {
      categories: {
        some: { name: category },
      },
    },
  })

  return {
    props: {
      inventory: products,
      title: category,
    },
  }
}

export default Category
