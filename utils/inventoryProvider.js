import inventory from './inventory'

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
  // Is provider configured ?
  if(process.env.NEXT_PUBLIC_PROVIDER) {
    const provider = await import(`../provider/${process.env.NEXT_PUBLIC_PROVIDER}/inventoryProvider`);
    return provider.default.fetchInventory();
  }
  return Promise.resolve(inventory)
}

export {
  fetchInventory, inventory as staticInventory
}