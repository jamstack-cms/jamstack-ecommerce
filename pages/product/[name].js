import { useState } from 'react'
import { SiteContext, ContextProviderComponent } from '../../context/mainContext'
import CartLink from '../../components/CartLink'
import Button from '../../components/Button'
import Image from '../../components/Image'
import QuantityPicker from '../../components/QuantityPicker'
import fetchInventory from '../../utils/inventoryProvider'
import { slugify } from '../../utils/helpers'

const ItemView = (props) => {
  const [numberOfitems, updateNumberOfItems] = useState(1)
  const { product } = props
  const { price, image, name, description } = product
  const { context: { addToCart }} = props

  function addItemToCart (product) {
    product["quantity"] = numberOfitems
    addToCart(product)
  }

  function increment() {
    updateNumberOfItems(numberOfitems + 1)
  }

  function decrement() {
    if (numberOfitems === 1) return
    updateNumberOfItems(numberOfitems - 1)
  }

  return (
    <>
      <CartLink />
      <div className="py-12 flex flex-1 flex-col
      md:flex-row
      w-full
      my-0 mx-auto">
        <div className="w-full md:w-1/2 h-112 flex flex-1 bg-light hover:bg-light-200">
          <div className="py-16 p10 flex flex-1 justify-center items-center">
            <Image src={image} alt="Inventory item" className="max-h-full" />
          </div>
        </div>
        <div className="pt-2 px-0 md:px-10 pb-8 w-full md:w-1/2">
          <h1 className="text-5xl font-light">{name}</h1>
          <h2 className="text-2xl tracking-wide py-8">${price}</h2>
          <p className="text-gray-600 text-sm">{description}</p>
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


function ItemViewWithContext(props) {
  return (
    <ContextProviderComponent>
      <SiteContext.Consumer>
        {
          context =>  <ItemView {...props} context={context} />
        }
      </SiteContext.Consumer>
    </ContextProviderComponent>
  )
}

export async function getStaticPaths () {
  const inventory = await fetchInventory()
  const paths = inventory.map(item => {
    return { params: { name: slugify(item.name) }}
  })
  return {
    paths,
    fallback: false
  }
}

export async function getStaticProps ({ params }) {
  const name = params.name.replace(/-/g," ")
  console.log('name: ', name)
  const inventory = await fetchInventory()
  const product = inventory.find(item => item.name.toLowerCase() === name)
  console.log('product: ', product)

  return {
    props: {
      product,
    }
  }
}

export default ItemViewWithContext