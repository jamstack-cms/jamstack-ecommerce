function inventoryByCategory (inventory) {
  return inventory.reduce((acc, next) => {
    const categories = next.categories
    categories.forEach(c => {
      const category = c.replace(/-/g," "); // Need to transform for matching datas
      if (acc[category]) {
        acc[category].items.push(next)
      } else {
        acc[category] = {}
        acc[category].items = []
        acc[category].items.push(next)
      }
    })
    return acc
  }, {})
}

export default {
  inventoryByCategory
}