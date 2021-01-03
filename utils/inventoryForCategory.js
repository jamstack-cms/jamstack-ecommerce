import fetchInventory from './inventoryProvider'
import inventoryByCategory from './inventoryProvider'

async function inventoryForCategory (category) {
  const inventory = await fetchInventory()
  const byCategory = inventoryByCategory(inventory)
  return byCategory
}

export default inventoryForCategory