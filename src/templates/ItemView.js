import React, { useState } from 'react'
import Popup from 'reactjs-popup'

import { SiteContext, ContextProviderComponent } from '../context/mainContext'
import CartLink from '../components/CartLink'
import Button from '../components/Button'
import Image from '../components/Image'
import QuantityPicker from '../components/QuantityPicker'

const ItemView = (props) => {
  const [numberOfitems, updateNumberOfItems] = useState(1)
  const item = props.pageContext.content
  const { price, image, name, description } = item
  const { context: { addToCart }} = props

  function addItemToCart (item) {
    item["quantity"] = numberOfitems
    addToCart(item)
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
            <Popup modal trigger={<img src={image} className="max-w-lg m-0 max-h-96 w-64 md:w-full" alt="Inventory item" />}>
              <Image src={image} alt="Inventory item" />
            </Popup>
          </div>
        </div>
        <div className="pt-2 px-0 md:px-10 pb-8 w-full md:w-1/2">
          <h1 className="text-5xl font-light">{name}</h1>
          <h2 className="text-2xl tracking-tighter">${price}</h2>
          <p className="text-gray-600 text-sm">{description}</p>
          <div className="mb-6">
            <QuantityPicker
              increment={increment}
              decrement={decrement}
              numberOfitems={numberOfitems}
            />
          </div>
          <Button
            full
            title="Add to Cart"
            onClick={() => addItemToCart(item)}
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


export default ItemViewWithContext
