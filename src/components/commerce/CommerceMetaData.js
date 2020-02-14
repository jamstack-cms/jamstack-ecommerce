// https://github.com/netlify/gocommerce#what-your-static-site-must-support
import React from 'react'

const CommerceMetaData = ({ item }) => (
  <script className="gocommerce-product" type="application/json">
    {JSON.stringify({
      sku: item.sku,
      title: item.name,
      prices: [{ amount: item.price, currency: 'usd' }], // TODO: Move currency into config file.
    })}
  </script>
)

export default CommerceMetaData
