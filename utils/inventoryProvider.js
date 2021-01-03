import inventory from '../inventory';

async function fetchInventory() {
  // const inventory = API.get(apiUrl)
  return Promise.resolve(inventory)
}

export default fetchInventory