import Head from 'next/head'
import { titleIfy , slugify } from '../utils/helpers'
import { DisplayMedium } from '../components'
import CartLink from '../components/CartLink'
import { inventoryCategories } from '../utils/inventoryByCategory'

function Categories ({ categories = [] }) {
  return (
    <>
      <div className="w-full">
        <CartLink />
        <Head>
          <title>Jamstack ECommerce - All Categories</title>
          <meta property="og:title" content="Jamstack ECommerce - All Categories" key="title" />
        </Head>
        <div className="
          sm:pt-10 pb-8
        ">
          <h1 className="text-5xl font-light">All categories</h1>
        </div>
        <div className="flex flex-col items-center">
          
          {/* <div className="my-4 lg:my-8 flex flex-col lg:flex-row justify-between"> */}
          <div className="grid gap-4
          lg:grid-cols-3 md:grid-cols-2 grid-cols-1">
          {
            categories.map((category, index) => (
              <DisplayMedium
                key={index}
                imageSrc={category.image}
                subtitle={`${category.itemCount} items`}
                title={titleIfy(category.name)}
                link={`/category/${slugify(category.name)}`}
              />
            ))
          }
          </div>
        </div>
      </div>
    </>
  )
}

export function getStaticProps() {
  const categories = inventoryCategories()
  return {
    props: {
      categories
    }
  }
}

export default Categories