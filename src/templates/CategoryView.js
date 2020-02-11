import React from 'react'
import ListItem from '../components/ListItem'
import { titleIfy, slugify } from '../../utils/helpers'
import DynamicLayout from '../layouts/dynamicLayout'

const CategoryView = (props) => {
  const { pageContext: { title, content: { items = [] }}} = props
  return (
    <DynamicLayout>
      <div className="flex flex-col items-center">
        <div className="max-w-fw flex flex-col">
          <div className="pt-10 pb-8">
            <h1 className="text-5xl font-light">{titleIfy(title)}</h1>
          </div>

          <div>
            <div className="flex flex-1 flex-wrap flex-row">
              {
                items.map((item, index) => {
                  return (
                    <ListItem
                      key={index}
                      link={slugify(item.name)}
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
    </DynamicLayout>
  )
}

export default CategoryView