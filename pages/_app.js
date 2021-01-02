import '../styles/globals.css'
import Layout from '../components/layout'
import { fetchCategories } from '../utils/navProvider'

function Ecommerce({ Component, categories, pageProps }) {
  return (
    <Layout categories={categories}>
      <Component {...pageProps} />
    </Layout>
  )
}

Ecommerce.getInitialProps = async () => {
  const categories = await fetchCategories()
  console.log('categories: ', categories)
  return {
    categories
  }
}

export default Ecommerce