import axios from 'axios'
axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_URL;

async function fetchInventory(category) {
  let aqlPrds = [];

  if(category) {
    const catResp = await axios.post('/v2/category', {lang:"en", PostBody: {filter: {['translation.en.name']: {$regex: category.toLowerCase(), $options: "i"}}}})

    const response = await axios.post('/v2/products/category/' + catResp.data._id, {lang:"en", PostBody: {filter: {}, structure: {['translation.en.description1']: 1, images: 1, ['translation.en.name']: 1, code: 1}, limit: 99}})
    aqlPrds = response.data.datas
  } else {
    const response = await axios.post('/v2/products', {lang:"en", PostBody: {filter: {}, structure: {images: 1}, limit: 99}})
    aqlPrds = response.data.datas
    
  }

  return convertProducts(aqlPrds);
}

// Convert products to the jamestack schema
async function convertProducts(aqlPrds) {
  for(const prd of aqlPrds) {
    if(prd.price.ati.special) {
      prd.price = prd.price.ati.special;
    } else {
      prd.price = prd.price.ati.normal;
    }
    prd.brand       = "";
    //prd.sku         = prd.code;
    prd.description = prd.description1.text;
    const mainImage = prd.images ? prd.images.find(img => img.default) : null;
    prd.image       = mainImage ? `${process.env.NEXT_PUBLIC_IMG_URL}/images/products/544x282-80-245,245,245,1/${mainImage._id}/${mainImage.title}${mainImage.extension}` : '';

    // Get the linked categories
    prd.categories = await findCategoriesForThisProduct(prd._id);
  }

  return aqlPrds;
}

// Get all categories (for the productsList)
async function findCategoriesForThisProduct(prd_id) {
  const result = await axios.post('/v2/categories', {lang:"en", PostBody: {filter: {action:"catalog"}, structure:{productsList:1}, limit: 99}});
  const allCategories = result.data.datas;

  let prdCategories = [];
  for (let j = 0; j < allCategories.length; j++ ) {
    const currentCat = allCategories[j];
    for (let index = 0; index < currentCat.productsList.length; index++) {
      if(currentCat.productsList[index].id == prd_id) {
        prdCategories.push(currentCat.slug.en);
      }
    }
  }

  return prdCategories;
}

export default {
  fetchInventory
}
