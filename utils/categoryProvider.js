import inventory from './inventory'

async function fetchCategories () {
  // Is provider configured ?
  if(process.env.NEXT_PUBLIC_PROVIDER) {
    const provider = await import(`../provider/${process.env.NEXT_PUBLIC_PROVIDER}/categoryProvider`);
    return provider.default.fetchCategories();
  }

  const categories = inventory.reduce((acc, next) => {
    next.categories.map(category => {
      if (acc.includes(category)) return
      acc.push(category)
    })
    return acc
  }, [])
  return Promise.resolve(categories)
}

export default fetchCategories