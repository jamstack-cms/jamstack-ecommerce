// https://stripe.com/docs/payments/without-card-authentication
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY) //"API_KEY"

exports.handler = async event => {
  if (!event.body || event.httpMethod !== "POST") {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        status: "invalid http method",
      }),
    }
  }

  const order = JSON.parse(event.body)

  const calculateOrderAmount = items => {
    // Replace this constant with a calculation of the order's amount
    // You should always calculate the order total on the server to prevent
    // people from directly manipulating the amount on the client
    return 1400
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: calculateOrderAmount(order.items),
      currency: "usd",
      payment_method: order.payment_method_id,

      // A PaymentIntent can be confirmed some time after creation,
      // but here we want to confirm (collect payment) immediately.
      confirm: true,

      // If the payment requires any follow-up actions from the
      // customer, like two-factor authentication, Stripe will error
      // and you will need to prompt them for a new payment method.
      error_on_requires_action: true,
    })

    if (intent.status === "succeeded") {
      // This creates a new Customer and attaches the PaymentMethod in one API call.
      const customer = await stripe.customers.create({
        payment_method: intent.payment_method,
        email: order.email,
        address: order.address,
      })
      // Handle post-payment fulfillment
      console.log(`Created Payment: ${intent.id} for Customer: ${customer.id}`)
      // Now ship those goodies
      await inventoryAPI.ship(order)
    } else {
      // Any other status would be unexpected, so error
      console.log({ error: "Unexpected status " + intent.status })
    }
  } catch (e) {
    if (e.type === "StripeCardError") {
      // Display error to customer
      console.log({ error: e.message })
    } else {
      // Something else happened
      console.log({ error: e.type })
    }
  }
}
