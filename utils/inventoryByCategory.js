
async function inventoryByCategory (inventory) {
  // Is provider configured ?
  if(process.env.NEXT_PUBLIC_PROVIDER) {
    const provider = await import(`../provider/${process.env.NEXT_PUBLIC_PROVIDER}/inventoryByCategory`);
    return provider.default.inventoryByCategory(inventory);
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