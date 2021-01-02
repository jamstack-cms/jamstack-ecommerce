import inventory from '../../inventory'

/*
Inventory items must adhere to the following schema:

type Product {
  id: ID!
  categories: [String]!
  price: Float!
  name: String!
  image: String!
  description: String!
  currentInventory: Int!
  brand: String
}
*/

export default () => {
  res.statusCode = 200
  res.json({ inventory })
}
