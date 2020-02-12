import React from "react"

import SEO from "../components/seo" 
import { Center, Footer, Tag, Showcase, DisplaySmall, DisplayMedium } from '../components'
import CartLink from '../components/CartLink'
import { titleIfy, slugify } from '../../utils/helpers'

import { graphql } from 'gatsby'

const Home = ({ data: gqlData }) => {
  const { inventoryInfo, categoryInfo: { data }} = gqlData
  const categories = data.slice(0, 2)
  const inventory = inventoryInfo.data.slice(0, 4)

  return (
    <>
      <CartLink />
      <SEO title="Home" />
      <div className="w-full">
        <div className="bg-green-200
        lg:h-hero
        p-6 pb-10 smpb-6
        flex lg:flex-row flex-col">
          <div className="pt-4 pl-2 sm:pt-12 sm:pl-12 flex flex-col">
            <Tag
              year="2020"
              category="SOFAS"
            />
            <Center
              price="200"
              title={inventory[2].name}
              link={slugify(inventory[2].name)}
            />
            <Footer
              designer="Jason Bourne"
            />
          </div>
          <div className="flex flex-1 justify-center items-center relative">
              <Showcase
                imageSrc={inventory[2].image}
              />
              <div className="absolute
              w-48 h-48 sm:w-72 sm:h-72 xl:w-88 xl:h-88
              bg-white z-0 rounded-full" />
          </div>
        </div>
      </div>
      <div className="my-4 lg:my-8 flex flex-col lg:flex-row justify-between">
        <DisplayMedium imageSrc={categories[0].image} subtitle={`${categories[0].itemCount} items`} title={titleIfy(categories[0].name)} link={slugify(categories[0].name)} />
        <DisplayMedium imageSrc={categories[1].image} subtitle={`${categories[1].itemCount} items`} title={titleIfy(categories[1].name)} link={slugify(categories[1].name)} />
      </div>
      <div className="pt-10 pb-6 flex flex-col items-center">
        <h2 className="text-4xl mb-3">Trending Now</h2>
        <p className="text-gray-600 text-sm">Find the perfect piece or accessory to finish off your favorite room in the house.</p>
      </div>
      <div className="my-8 flex flex-col lg:flex-row justify-between">
        <DisplaySmall imageSrc={inventory[0].image} title={inventory[0].name} subtitle={inventory[0].categories[0]} link={slugify(inventory[0].name)} />
        
        <DisplaySmall imageSrc={inventory[1].image} title={inventory[1].name} subtitle={inventory[1].categories[0]} link={slugify(inventory[1].name)} />
        
        <DisplaySmall imageSrc={inventory[2].image} title={inventory[2].name} subtitle={inventory[2].categories[0]} link={slugify(inventory[2].name)} />
        
        <DisplaySmall imageSrc={inventory[3].image} title={inventory[3].name} subtitle={inventory[3].categories[0]} link={slugify(inventory[3].name)} />
      </div>
    </>
  )
}

export const pageQuery = graphql`
  query {
    navInfo {
      data
    }
    categoryInfo {
      data {
        name
        image
        itemCount
      }
    }
    inventoryInfo {
      data {
        image
        name
        categories
        description
        id
      }
    }
  }
`

export default Home
