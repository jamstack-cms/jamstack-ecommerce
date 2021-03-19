import { fetchInventory } from './inventoryProvider'
import { inventoryByCategory } from './inventoryByCategory'

async function inventoryForCategory (category) {
  const inventory = await fetchInventory()
  const byCategory = await inventoryByCategory(inventory)
  return byCategory[category].items
}

export default inventoryForCategory