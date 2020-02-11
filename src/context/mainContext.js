import React from "react"
import { StaticQuery, graphql } from 'gatsby'
import { toast } from 'react-toastify';

const mainQuery = graphql`
  query {
    navInfo {
      data
    }
  }
`

const STORAGE_KEY = 'GATSBY_ECOMMERCE_STARTER_'

const initialState = {
  cart: [],
  numberOfItemsInCart: 0,
  total: 0
}

const SiteContext = React.createContext()

function calculateTotal(cart) {
  const total = cart.reduce((acc, next) => {
    acc = acc + JSON.parse(next.price)
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
  addToCart = (item) => {
    const storageState = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    const { cart } = storageState
    cart.push(item)
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
    console.log('state: ', state)

    return (
      <StaticQuery query={mainQuery}>
        { queryData => {
          return (
            <SiteContext.Provider value={{
              ...state,
               navItems: queryData,
               addToCart: this.addToCart,
               clearCart: this.clearCart,
               removeFromCart: this.removeFromCart
            }}>
             {this.props.children}
           </SiteContext.Provider>
          )
        }}
        </StaticQuery>
    )
  }
}

export {
  SiteContext,
  ContextProviderComponent
}