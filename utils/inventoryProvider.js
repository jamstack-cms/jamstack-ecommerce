import inventory from './inventory'
import provideraquilacms from '../provider/aquila-cms/inventoryProvider'

/*
Inventory items should adhere to the following schema:
type Product {
  id: ID!
  categories: [String]!
  price: Float!
  name: String!
  image: String!
  description: String!
  currentInventory: Int!
  brand: String
  sku: ID
}
*/

async function fetchInventory() {
  // const inventory = API.get(apiUrl)
  if(process.env.NEXT_PUBLIC_PROVIDER === "aquila-cms") {
    return provideraquilacms.fetchInventory();
  }
  return Promise.resolve(inventory)
}

export {
  fetchInventory, inventory as staticInventory
}