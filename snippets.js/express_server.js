// Online example: https://runkit.com/thor-stripe/gocommerce-clone-api
const express = require('express')
const app = express()
const port = 3000

const fetch = require('isomorphic-unfetch')
const DomParser = require('dom-parser')
const parser = new DomParser()

const stripe = require('stripe')(process.env.JAMSTACK_SECRET_KEY)

// Constants
const SITE_URL = 'https://53806382.ngrok.io/'
// Helper functions
const getProductData = async url => {
  // Get the product meta from the static page
  const doc = await fetch(url).then(async res => {
    const htmlString = await res.text()
    return parser.parseFromString(htmlString, 'text/html')
  })
  if (doc.getElementsByClassName('gocommerce-product').length !== 1) {
    throw new Error('None or too many product data declarations!')
    return
  }
  // Replace HTML special chars
  const jsonString = doc
    .getElementsByClassName('gocommerce-product')[0]
    .innerHTML.replace(/&quot;/g, `"`)
  return JSON.parse(jsonString)
}
const calculateOrderAmount = ({ order, products }) => {
  let validatedAmount = 0
  order.cart.forEach(item => {
    // Get product by sku
    const product = products.find(product => product.sku === item.sku)
    // Get price by currency
    const price = product.prices.find(price => {
      return price.currency === order.currency
    })
    if (!price)
      throw new Error(
        `${product.sku} has no price info for currency ${order.currency}`
      )
    validatedAmount += Number(price.amount)
  })
  return validatedAmount
}

// use body-parser to automatically parse JSON-encoded request bodies
const bodyParser = require('body-parser')
app.use(bodyParser.json())

// Allow cors
app.use('/', function(req, res, next) {
  // Allow requests from localhost.
  const allowedOrigins = ['http://localhost:9000'] // port that's used when running gatsby serve
  const origin = req.headers.origin
  if (allowedOrigins.indexOf(origin) > -1) {
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  next()
})

app.post('/pay', async (req, res) => {
  const { order } = req.body
  const skuIds = order.cart.map(item => item.sku)

  const promises = skuIds.map(
    sku =>
      new Promise(async (resolve, reject) => {
        try {
          const product = await getProductData(`${SITE_URL}${sku}`)
          resolve(product)
        } catch (error) {
          reject(error)
        }
      })
  )
  // Wait for all producst to be fetched
  const products = await Promise.all(promises)
  const totalAmount = calculateOrderAmount({ order, products })
  if (totalAmount === Number(order.amount)) {
    // Create Payment
    try {
      const intent = await stripe.paymentIntents.create({
        amount: totalAmount * 100, // TODO zero decimal currency detection
        currency: order.currency,
        payment_method: order.payment_method_id,
        setup_future_usage: 'off_session',

        // A PaymentIntent can be confirmed some time after creation,
        // but here we want to confirm (collect payment) immediately.
        confirm: true,

        // If the payment requires any follow-up actions from the
        // customer, like two-factor authentication, Stripe will error
        // and you will need to prompt them for a new payment method.
        error_on_requires_action: true,
      })

      if (intent.status === 'succeeded') {
        // This creates a new Customer and attaches the PaymentMethod in one API call.
        const customer = await stripe.customers.create({
          payment_method: intent.payment_method,
          email: order.email,
          address: order.address,
        })
        // Handle post-payment fulfillment
        console.log(
          `Created Payment: ${intent.id} for Customer: ${customer.id}`
        )
        // Now ship those goodies
        // await inventoryAPI.ship(order)
        res.json({ payment: intent, customer })
      } else {
        // Any other status would be unexpected, so error
        res
          .status(400)
          .json({ error: { message: 'Unexpected status ' + intent.status } })
      }
    } catch (error) {
      if (error.type === 'StripeCardError') {
        // Display error to customer
        res.status(400).json({ error: error.raw })
      } else {
        // Something else happened
        res.status(400).json({ error })
      }
    }
  } else {
    res
      .status(400)
      .json({ error: 'Order amount does not match product prices.' })
  }
})

app.listen(port, () => console.log(`Example API listening on port ${port}!`))
