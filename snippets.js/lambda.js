const stripe = require("stripe")("API_KEY")

/*
const order = {
  email: 'customer@site.com',
  amount: total,
  token: token.id,
  address: this.state,
}
*/

exports.handler = async event => {
  if (!event.body || event.httpMethod !== "POST") {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        status: "invalid http method"
      })
    }
  }

  const order = JSON.parse(event.body)

  await stripe.customers
    .create({
      email: order.email,
      source: order.token,
      address: order.address
    })
    .then(customer => {
      return stripe.charges
        .create(
          {
            currency: "usd",
            amount: order.amount,
            receipt_email: order.email,
            customer: customer.id,
            description: "Purchase from JSEC"
          },
          {
            idempotency_key: order.id
          }
        )
        .then(result => {
          console.log(`Charge created: ${result}`)
        })
    })
    
}