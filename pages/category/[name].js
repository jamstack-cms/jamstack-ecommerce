import ListItem from '../../components/ListItem'
import { titleIfy, slugify } from '../../utils/helpers'
import fetchCategories from '../../utils/categoryProvider'
import inventoryForCategory from '../../utils/inventoryForCategory'
import { SiteContext, ContextProviderComponent } from '../../context/mainContext'

const Category = (props) => {
  const { inventory, title } = props
  return (
    <>
      <div className="flex flex-col items-center">
        <div className="max-w-fw flex flex-col w-full">
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

function CategoryViewWithContext(props) {
  return (
    <ContextProviderComponent>
      <SiteContext.Consumer>
        {
          context =>  <Category {...props} context={context} />
        }
      </SiteContext.Consumer>
    </ContextProviderComponent>
  )
}

export async function getStaticPaths () {
  const categories = await fetchCategories()
  const paths = categories.map(category => {
    return { params: { name: slugify(category) }}
  })
  return {
    paths,
    fallback: false
  }
}

export async function getStaticProps ({ params }) {
  const category = params.name.replace(/-/g," ")
  const inventory = await inventoryForCategory(category)
  return {
    props: {
      inventory,
      title: category
    }
  }
}

export default CategoryViewWithContext