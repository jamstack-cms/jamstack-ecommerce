import '../styles/globals.css'
import Layout from '../layouts/layout'
/* Uncomment for dynamic nav
import fetchCategories from '../utils/categoryProvider'
*/

function Ecommerce({ Component, pageProps }) {
  const categories = ['new arrivals', 'sofas', 'living room', 'on sale']
  return (
    <Layout categories={categories}>
      <Component {...pageProps} />
    </Layout>
  )
}

/* Uncomment for dynamic nav
Ecommerce.getInitialProps = async () => {
  const categories = await fetchCategories()
  return {
    categories
  }
}
*/

export default Ecommerce