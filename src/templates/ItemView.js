import React from 'react'
import Button from '../components/Button'

import { SiteContext, ContextProviderComponent } from '../context/mainContext'
import DynamicLayout from '../layouts/dynamicLayout'
import Image from '../components/Image'

const ItemView = (props) => {
  const item = props.pageContext.content
  const { price, image, name, description } = item
  const { context: { addToCart }} = props

  function addItemToCart (item) {
    addToCart(item)
  }

  return (
    <DynamicLayout>
      <div className="py-12 flex flex-1 flex-col md:flex-row w-full xl:w-fw my-0 mx-auto">
        <div className="w-full md:w-1/2 h-112 flex flex-1 bg-light hover:bg-light-200">
          <div className="py-16 p10 flex flex-1 justify-center items-center">
            <Image src={image} className="max-w-lg m-0 max-h-96 w-64 md:w-full" alt="Inventory item"  />
          </div>
        </div>
        <div className="pt-2 px-0 md:px-10 pb-8 w-full md:w-1/2">
          <h1 className="text-5xl font-light">{name}</h1>
          <h2 className="text-2xl tracking-tighter">${price}</h2>
          <p className="text-gray-600 text-sm">{description}</p>
          <Button
            full
            title="Add to Cart"
            onClick={() => addItemToCart(item)}
          />
        </div>
      </div>
    </DynamicLayout>
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
