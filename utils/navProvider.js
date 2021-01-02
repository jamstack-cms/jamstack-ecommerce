import inventory from '../inventory'

async function fetchCategories () {
  const categories = inventory.reduce((acc, next) => {
    next.categories.map(category => {
      if (acc.includes(category)) return
      acc.push(category)
    })
    return acc
  }, [])
  console.log('categories: ', categories)
  return Promise.resolve(categories)
}

export {
  fetchCategories
}