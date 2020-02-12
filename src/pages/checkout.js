import React, { useState, useEffect } from 'react'

import { SiteContext, ContextProviderComponent } from '../context/mainContext'
import { DENOMINATION } from '../../providers/inventoryProvider'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import { Link } from 'gatsby'
import Image from '../components/Image'
import {
  CardElement,
  injectStripe, Elements, StripeProvider
} from 'react-stripe-elements'
import uuid from 'uuid/v4'

function calculateShipping() {
  return 0
}

class Checkout extends React.Component {
  state = {
    email: '', street: '', city: '', postal_code: '', state: '', orderComplete: false
  }
  onChange = e => {
    this.setState({ [e.target.name]: e.target.value })
  }
  handleSubmit = async (event) => {
    event.preventDefault()
    const { email, street, city, postal_code, state} = this.state
    if (!street || !city || !postal_code || !state) return
    const {total} = this.props.context
    // const { token } = await this.props.stripe.createToken()

    const order = {
      email: email,
      amount: total,
      address: this.state,
      token: 'tok_visa',
      receipt_email: 'customer@example.com',
      id: uuid()
    }
    this.createOrder(order)
  }
  createOrder = (order) => {
    const { clearCart } = this.props.context
    console.log('order: ', order)
    // call API
    this.setState(() => ({ orderComplete: true }))
    clearCart()
  }
  render() {
    const { street, city, postal_code, state, email, orderComplete } = this.state
    const { context } = this.props
    const { numberOfItemsInCart, cart, total } = context
    const cartEmpty = numberOfItemsInCart === Number(0)

    if (orderComplete) {
      return (
        <div>
          <h3>Thanks! Your order has been successfully processed.</h3>
        </div>
      )
    }

    return (
        <div className="flex flex-col items-center pb-10">
          <div className="
            flex flex-col w-full
            c_large:w-c_large
          ">
            <div className="pt-10 pb-8">
              <h1 className="text-5xl font-light">Checkout</h1>
              <Link to="/cart">
                <div className="cursor-pointer flex">
                  <FaLongArrowAltLeft className="mr-2 text-gray-600 mt-1" />
                  <p className="text-gray-600 text-sm">Edit Cart</p>
                </div>
              </Link>
            </div>

            {
              cartEmpty ? (
                <h3>No items in cart.</h3>
              ) : (
                <div className="flex flex-col">
                  <div className="">
                    {
                      cart.map((item, index) => {
                        return (
                          <div className="border-b py-10" key={index}>
                            <div className="flex items-center">
                              <Image className="w-32 m-0" src={item.image} alt={item.name} />
                              <p className="m-0 pl-10 text-gray-600 text-sm">
                                {item.name}
                              </p>
                              <div className="flex flex-1 justify-end">
                                <p className="m-0 pl-10 text-gray-900 tracking-tighter font-semibold">
                                  {DENOMINATION + item.price}
                                </p>
                              </div>
        
                            </div>
                          </div>
                        )
                      })
                    }
                  </div>  
                  <div className="flex flex-1 flex-col md:flex-row">
                    <div className="flex flex-1 pt-8 flex-col">
                      <div className="mt-4 border-t pt-10">
                        <form>
                          <CardElement className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
                          <Input onChange={this.onChange} value={email} name="email" placeholder="Email" />
                          <Input onChange={this.onChange} value={street} name="street" placeholder="Street" />
                          <Input onChange={this.onChange} value={city} name="city" placeholder="City" />
                          <Input onChange={this.onChange} value={state} name="state" placeholder="State" />
                          <Input onChange={this.onChange} value={postal_code} name="postal_code" placeholder="Postal Code" />
                          <button onClick={this.handleSubmit} className="hidden md:block bg-secondary hover:bg-black text-white font-bold py-2 px-4 mt-4 rounded focus:outline-none focus:shadow-outline" type="button">
                            Confirm order
                          </button>
                        </form>
                      </div>
                    </div>
                    <div className="md:pt-20">
                      <div className="ml-4 pl-2 flex flex-1 justify-end pt-2 md:pt-8 pr-4">
                        <p className="text-sm pr-10">Subtotal</p>
                        <p className="tracking-tighter w-38 flex justify-end">{DENOMINATION + total}</p>
                      </div>
                      <div className="ml-4 pl-2 flex flex-1 justify-end pr-4">
                        <p className="text-sm pr-10">Shipping</p>
                        <p className="tracking-tighter w-38 flex justify-end">FREE SHIPPING</p>
                      </div>
                      <div className="md:ml-4 pl-2 flex flex-1 justify-end bg-gray-200 pr-4 pt-6">
                        <p className="text-sm pr-10">Total</p>
                        <p className="font-semibold tracking-tighter w-38 flex justify-end">{DENOMINATION + (total + calculateShipping())}</p>
                      </div>
                      <button onClick={this.handleSubmit} className="md:hidden bg-secondary hover:bg-black text-white font-bold py-2 px-4 mt-4 rounded focus:outline-none focus:shadow-outline" type="button">
                          Confirm order
                        </button>
                    </div>
                  </div>
              </div>
              )
            }
            
          </div>
        </div>
    )
  }
}

const InjectedCheckout = injectStripe(Checkout)

function CheckoutWithContext(props) {
  const [apiKey, updateApiKey] = useState(null)
  useEffect(() => {
    updateApiKey(window.Stripe("pk_test_DvXwcKnVaaZUpWJIbh9cjgZr00IjIAjZAA"))
  }, [])
  return (
    <ContextProviderComponent>
      <SiteContext.Consumer>
        {
          context => (
            <StripeProvider stripe={apiKey}>
              <Elements>
                <InjectedCheckout {...props} context={context} />
              </Elements>
            </StripeProvider>)
        }
      </SiteContext.Consumer>
    </ContextProviderComponent>
  )
}

function Input({ onChange, value, name, placeholder}) {
  return (
    <input
      onChange={onChange}
      value={value} className="mt-2 text-sm shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" placeholder={placeholder} name={name} />
  )
}

export default CheckoutWithContext