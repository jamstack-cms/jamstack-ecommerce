import axios from 'axios'

async function fetchCategories () {
  const response = await axios.post('/v2/categories', {lang:"en", PostBody: {filter: {'action':'catalog'}, limit: 99}})
  return response.data.datas.map(cat => cat.name)
}

export default {
  fetchCategories
}