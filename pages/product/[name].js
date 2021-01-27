import { useState } from "react"
import Head from "next/head"
import Button from "../../components/Button"
import Image from "../../components/Image"
import QuantityPicker from "../../components/QuantityPicker"
import { fetchInventory } from "../../utils/inventoryProvider"
import { slugify } from "../../utils/helpers"
import CartLink from "../../components/CartLink"
import {
  SiteContext,
  ContextProviderComponent,
} from "../../context/mainContext"
import prismaClient from "../../lib/prisma-client"

const ItemView = (props) => {
  const [numberOfitems, updateNumberOfItems] = useState(1)
  const { product } = props
  const { price, image, name, description, currentInventory } = product
  const {
    context: { addToCart },
  } = props

  function addItemToCart(product) {
    product["quantity"] = numberOfitems
    addToCart(product)
  }

  function increment() {
    if (numberOfitems < currentInventory) {
      updateNumberOfItems(numberOfitems + 1)
    }
  }

  function decrement() {
    if (numberOfitems === 1) return
    updateNumberOfItems(numberOfitems - 1)
  }

  return (
    <>
      <CartLink />
      <Head>
        <title>Jamstack ECommerce - {name}</title>
        <meta name="description" content={description} />
        <meta
          property="og:title"
          content={`Jamstack ECommerce - ${name}`}
          key="title"
        />
      </Head>
      <div className="flex flex-col flex-1 w-full py-4 mx-auto my-0 sm:py-12 md:flex-row">
        <div className="flex flex-1 w-full md:w-1/2 h-120 bg-light hover:bg-light-200">
          <div className="flex items-center justify-center flex-1 py-16 p10">
            <Image src={image} alt="Inventory item" className="max-h-full" />
          </div>
        </div>
        <div className="w-full px-0 pt-2 pb-8 md:px-10 md:w-1/2">
          <h1 className="mt-2 text-5xl font-light sm:mt-0 leading-large">
            {name}
          </h1>
          <h2 className="py-6 text-2xl tracking-wide sm:py-8">${price}</h2>
          <p className="leading-7 text-gray-600">{description}</p>
          <div className="my-6">
            <QuantityPicker
              increment={increment}
              decrement={decrement}
              numberOfitems={numberOfitems}
            />
          </div>
          <Button
            full
            title="Add to Cart"
            onClick={() => addItemToCart(product)}
          />
        </div>
      </div>
    </>
  )
}

export async function getStaticPaths() {
  const inventory = await fetchInventory()
  const paths = inventory.map((item) => {
    return { params: { name: slugify(item.name) } }
  })
  return {
    paths,
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  const name = params.name.replace(/-/g, " ")
  const product = await prismaClient.product.findFirst({
    where: {
      name: {
        contains: name,
      },
    },
  })
  return {
    props: {
      product,
    },
  }
}

function ItemViewWithContext(props) {
  return (
    <ContextProviderComponent>
      <SiteContext.Consumer>
        {(context) => <ItemView {...props} context={context} />}
      </SiteContext.Consumer>
    </ContextProviderComponent>
  )
}

export default ItemViewWithContext
