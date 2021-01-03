import ListItem from '../../components/ListItem'
import { titleIfy, slugify } from '../../utils/helpers'
import CartLink from '../../components/CartLink'
import fetchCategories from '../../utils/categoryProvider'
import inventoryForCategory from '../../utils/inventoryForCategory'

const Category = (props) => {
  const { inventory, title } = props
  return (
    <>
      <CartLink />
      <div className="flex flex-col items-center">
        <div className="max-w-fw flex flex-col">
          <div className="pt-10 pb-8">
            <h1 className="text-5xl font-light">{titleIfy(title)}</h1>
          </div>

          <div>
            <div className="flex flex-1 flex-wrap flex-row">
              {
                inventory.map((item, index) => {
                  return (
                    <ListItem
                      key={index}
                      link={`/product/${slugify(item.name)}`}
                      title={item.name}
                      price={item.price}
                      imageSrc={item.image}
                    />
                  )
                })
              }
            </div>
          </div>
          </div>
      </div>
    </>
  )
}

export async function getStaticPaths () {
  const categories = await fetchCategories()
  const paths = categories.map(category => ({ params: { name: slugify(category) }}))
  return {
    paths,
    fallback: false
  }
}

export async function getStaticProps ({ params }) {
  const inventory = await inventoryForCategory(params.name)
  return {
    props: {
      inventory,
      title: params.name
    }
  }
}

export default Category