import inventory from '../inventory';

async function fetchInventory() {
  return new Promise(resolve => {
    // const inventory = API.get(apiUrl)
    resolve(inventory)
  })
}

export default fetchInventory