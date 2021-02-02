import inventory from './inventory'
import provideraquilacms from '../provider/aquila-cms/categoryProvider'

async function fetchCategories () {
  if(process.env.NEXT_PUBLIC_PROVIDER === "aquila-cms") {
    return provideraquilacms.fetchCategories();
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