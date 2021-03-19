async function fetchCategories () {
  const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/v2/categories', {
    method: 'POST',
    body: JSON.stringify({lang:"en", PostBody: {"limit":99, "filter":{"code":"my-products"}, "structure":{"children":1}, "populate":["children"]}}),
    headers: {"Content-type": "application/json; charset=UTF-8"}
  })
  const data = await response.json();
  return data.datas[0].children.map(cat => cat.name)
}

export default {
  fetchCategories
}