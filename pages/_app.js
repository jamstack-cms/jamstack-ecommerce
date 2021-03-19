import '../styles/globals.css'
import Layout from '../layouts/layout'
import fetchCategories from '../utils/categoryProvider'
import axios from 'axios';

if(process.env.NEXT_PUBLIC_API_URL) {
  axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_URL;
}
function Ecommerce({ Component, pageProps, categories }) {
  return (
    <Layout categories={categories}>
      <Component {...pageProps} />
    </Layout>
  )
}

Ecommerce.getInitialProps = async () => {
  const categories = await fetchCategories()
  return {
    categories
  }
}

export default Ecommerce