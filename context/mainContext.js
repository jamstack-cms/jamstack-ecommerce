import { toast } from 'react-toastify'
import React from 'react'
const STORAGE_KEY = 'NEXT_ECOMMERCE_STARTER_'

const initialState = {
  cart: [],
  numberOfItemsInCart: 0,
  total: 0
}

const SiteContext = React.createContext()

function calculateTotal(cart) {
  const total = cart.reduce((acc, next) => {
    const quantity = next.quantity
    acc = acc + JSON.parse(next.price) * quantity
    return acc
  }, 0)
  return total
}

class ContextProviderComponent extends React.Component {
  componentDidMount() {
    if (typeof window !== 'undefined') {
      const storageState = window.localStorage.getItem(STORAGE_KEY)
      if (!storageState) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState))
      }
    }
  }

  setItemQuantity = (item) => {
    const storageState = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    const { cart } = storageState
    const index = cart.findIndex(cartItem => cartItem.id === item.id)
    cart[index].quantity = item.quantity
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cart, numberOfItemsInCart: cart.length, total: calculateTotal(cart)
    }))
    this.forceUpdate()
  }

  addToCart = item => {
    const storageState = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    const { cart } = storageState
    if (cart.length) {
      const index = cart.findIndex(cartItem => cartItem.id === item.id)
      if (index >= Number(0)) {
        /* If this item is already in the cart, update the quantity */
        cart[index].quantity = cart[index].quantity + item.quantity
      } else {
        /* If this item is not yet in the cart, add it */
        cart.push(item)
      }
    } else {
      /* If no items in the cart, add the first item. */
      cart.push(item)
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cart, numberOfItemsInCart: cart.length, total: calculateTotal(cart)
    }))
    toast("Successfully added item to cart!", {
      position: toast.POSITION.TOP_LEFT
    })
    this.forceUpdate()
  }

  removeFromCart = (item) => {
    const storageState = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    let { cart } = storageState
    cart = cart.filter(c => c.id !== item.id)

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cart, numberOfItemsInCart: cart.length, total: calculateTotal(cart)
    }))
    this.forceUpdate()
  }

  clearCart = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState))
    this.forceUpdate()
  }

  render() {
    let state = initialState
    if (typeof window !== 'undefined') {
      const storageState = window.localStorage.getItem(STORAGE_KEY)
      if (storageState) {
        state = JSON.parse(storageState)
      }
    }

    return (
      <SiteContext.Provider value={{
        ...state,
         addToCart: this.addToCart,
         clearCart: this.clearCart,
         removeFromCart: this.removeFromCart,
         setItemQuantity: this.setItemQuantity
      }}>
       {this.props.children}
     </SiteContext.Provider>
    )
  }
}

export {
  SiteContext,
  ContextProviderComponent
}