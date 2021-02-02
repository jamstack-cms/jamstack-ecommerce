import provideraquilacms from '../provider/aquila-cms/inventoryByCategory'

function inventoryByCategory (inventory) {
  if(process.env.NEXT_PUBLIC_PROVIDER === "aquila-cms") {
    return provideraquilacms.inventoryByCategory(inventory);
  }

  return inventory.reduce((acc, next) => {
    const categories = next.categories
    categories.forEach(c => {
      if (acc[c]) {
        acc[c].items.push(next)
      } else {
        acc[c] = {}
        acc[c].items = []
        acc[c].items.push(next)
      }
    })
    return acc
  }, {})
}

export {
  inventoryByCategory
}